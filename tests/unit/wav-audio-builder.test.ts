import { describe, expect, it } from "vitest";
import {
  concatenate,
  createSilence,
  createTick,
  durationSeconds,
  encodeWav,
  parseWav,
  REPLAY_SAMPLE_RATE,
  resample,
  WavFormatError,
} from "../../src/audio/wav-audio-builder.ts";

/** A minimal WAV with the given format fields and extra chunks before "data". */
function buildWav(options: { channels?: number; bitsPerSample?: number; audioFormat?: number; sampleRate?: number; samples?: number[]; dataSizeField?: number; extraChunk?: boolean }): Uint8Array {
  const samples = options.samples ?? [100, -100, 200];
  const extra = options.extraChunk ? 12 : 0;
  const bytes = new Uint8Array(44 + extra + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeId = (offset: number, id: string) => [...id].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  writeId(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  writeId(8, "WAVE");
  writeId(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, options.audioFormat ?? 1, true);
  view.setUint16(22, options.channels ?? 1, true);
  view.setUint32(24, options.sampleRate ?? 22_050, true);
  view.setUint16(34, options.bitsPerSample ?? 16, true);
  let offset = 36;
  if (options.extraChunk) {
    writeId(offset, "LIST");
    view.setUint32(offset + 4, 4, true);
    writeId(offset + 8, "INFO");
    offset += 12;
  }
  writeId(offset, "data");
  view.setUint32(offset + 4, options.dataSizeField ?? samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(offset + 8 + index * 2, sample, true));
  return bytes;
}

describe("parseWav", () => {
  it("reads 16-bit mono PCM samples and the sample rate", () => {
    const audio = parseWav(buildWav({ samples: [1, -2, 3], sampleRate: 16_000 }));
    expect(audio.sampleRate).toBe(16_000);
    expect([...audio.samples]).toEqual([1, -2, 3]);
  });

  it("skips chunks it doesn't need (e.g. LIST)", () => {
    expect([...parseWav(buildWav({ samples: [7, 8], extraChunk: true })).samples]).toEqual([7, 8]);
  });

  it("trusts the file length when the data size is a streaming placeholder", () => {
    expect([...parseWav(buildWav({ samples: [5, 6], dataSizeField: 0xffffffff })).samples]).toEqual([5, 6]);
  });

  it("rejects formats it can't join safely", () => {
    expect(() => parseWav(buildWav({ channels: 2 }))).toThrow(WavFormatError);
    expect(() => parseWav(buildWav({ bitsPerSample: 8 }))).toThrow(WavFormatError);
    expect(() => parseWav(buildWav({ audioFormat: 3 }))).toThrow(WavFormatError);
    expect(() => parseWav(new TextEncoder().encode("not a wav file at all"))).toThrow(WavFormatError);
  });
});

describe("generated sounds", () => {
  it("makes a soft 30 ms tick that fades in and out", () => {
    const tick = createTick(REPLAY_SAMPLE_RATE);
    expect(tick.length).toBe(Math.round(REPLAY_SAMPLE_RATE * 0.03));
    const peak = Math.max(...[...tick].map(Math.abs));
    expect(peak).toBeGreaterThan(1_000);
    expect(peak).toBeLessThanOrEqual(Math.ceil(0.15 * 32_767));
    expect(tick[0]).toBe(0);
    expect(Math.abs(tick.at(-1) ?? 1)).toBeLessThan(200);
  });

  it("makes real silence of the requested length", () => {
    const silence = createSilence(REPLAY_SAMPLE_RATE, 1_500);
    expect(silence.length).toBe(33_075);
    expect(silence.every((sample) => sample === 0)).toBe(true);
  });
});

describe("resample and concatenate", () => {
  it("keeps the duration when resampling", () => {
    const audio = { sampleRate: 11_025, samples: new Int16Array(11_025).fill(1_000) };
    const resampled = resample(audio, REPLAY_SAMPLE_RATE);
    expect(resampled.length).toBe(REPLAY_SAMPLE_RATE);
    expect(resampled[100]).toBe(1_000);
  });

  it("joins parts in order", () => {
    expect([...concatenate([new Int16Array([1, 2]), new Int16Array([]), new Int16Array([3])])]).toEqual([1, 2, 3]);
  });
});

describe("encodeWav", () => {
  it("writes a valid 44-byte PCM header and round-trips through parseWav", () => {
    const samples = concatenate([createTick(REPLAY_SAMPLE_RATE), createSilence(REPLAY_SAMPLE_RATE, 500)]);
    const bytes = encodeWav({ sampleRate: REPLAY_SAMPLE_RATE, samples });
    const view = new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
    expect(new TextDecoder().decode(bytes.slice(8, 16))).toBe("WAVEfmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(REPLAY_SAMPLE_RATE);
    expect(view.getUint32(28, true)).toBe(REPLAY_SAMPLE_RATE * 2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(samples.length * 2);

    const parsed = parseWav(bytes);
    expect([...parsed.samples]).toEqual([...samples]);
    expect(durationSeconds(parsed)).toBeCloseTo(0.53, 2);
  });
});
