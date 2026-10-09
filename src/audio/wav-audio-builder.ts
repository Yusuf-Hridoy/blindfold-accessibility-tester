// Pure functions for the audio replay: read espeak-ng's PCM WAV files, make
// ticks and silence, join everything, and write one WAV file. Only 16-bit mono
// PCM is supported; other sample rates are resampled.

export const REPLAY_SAMPLE_RATE = 22_050;

export interface PcmAudio {
  sampleRate: number;
  /** 16-bit mono samples. */
  samples: Int16Array;
}

/** The WAV isn't a format the replay can use. The replay is then skipped, never the run. */
export class WavFormatError extends Error {}

const PCM_FORMAT = 1;
const EXTENSIBLE_FORMAT = 0xfffe;
const HEADER_BYTES = 44;

function readChunkId(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

/** Reads a 16-bit mono PCM WAV. Chunks other than "fmt " and "data" are skipped. */
export function parseWav(bytes: Uint8Array): PcmAudio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || readChunkId(view, 0) !== "RIFF" || readChunkId(view, 8) !== "WAVE") {
    throw new WavFormatError("not a RIFF/WAVE file");
  }
  let format: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = readChunkId(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 16) throw new WavFormatError("the format chunk is too short");
      format = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format) throw new WavFormatError("the data chunk comes before the format chunk");
      if (format.audioFormat !== PCM_FORMAT && format.audioFormat !== EXTENSIBLE_FORMAT) {
        throw new WavFormatError(`audio format ${format.audioFormat} isn't PCM`);
      }
      if (format.bitsPerSample !== 16 || format.channels !== 1) {
        throw new WavFormatError(`${format.bitsPerSample}-bit audio with ${format.channels} channels isn't 16-bit mono`);
      }
      if (format.sampleRate <= 0) throw new WavFormatError("the sample rate is 0");
      // Programs that stream WAV write a placeholder size; trust the file length instead.
      const available = Math.min(size, bytes.byteLength - body);
      const samples = new Int16Array(Math.floor(available / 2));
      for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(body + index * 2, true);
      return { sampleRate: format.sampleRate, samples };
    }
    offset = body + size + (size % 2);
  }
  throw new WavFormatError("there is no data chunk");
}

export function millisecondsToSamples(sampleRate: number, milliseconds: number): number {
  return Math.round((sampleRate * milliseconds) / 1000);
}

export function createSilence(sampleRate: number, milliseconds: number): Int16Array {
  return new Int16Array(millisecondsToSamples(sampleRate, milliseconds));
}

/** A short, soft sine-wave tick, faded in and out so it doesn't click. */
export function createTick(sampleRate: number, milliseconds = 30, frequency = 1_000, volume = 0.15): Int16Array {
  const length = millisecondsToSamples(sampleRate, milliseconds);
  const fadeLength = Math.max(1, Math.floor(length / 5));
  const tick = new Int16Array(length);
  for (let index = 0; index < length; index++) {
    const fade = Math.min(1, index / fadeLength, (length - 1 - index) / fadeLength);
    tick[index] = Math.round(Math.sin((2 * Math.PI * frequency * index) / sampleRate) * volume * fade * 32_767);
  }
  return tick;
}

/** Linear-interpolation resampling; enough for speech. */
export function resample(audio: PcmAudio, targetRate: number): Int16Array {
  if (audio.sampleRate === targetRate) return audio.samples;
  const { samples } = audio;
  const length = Math.round((samples.length * targetRate) / audio.sampleRate);
  const resampled = new Int16Array(length);
  for (let index = 0; index < length; index++) {
    const position = (index * audio.sampleRate) / targetRate;
    const before = Math.floor(position);
    const after = Math.min(before + 1, samples.length - 1);
    const weight = position - before;
    resampled[index] = Math.round((samples[before] ?? 0) * (1 - weight) + (samples[after] ?? 0) * weight);
  }
  return resampled;
}

export function concatenate(parts: Int16Array[]): Int16Array {
  const joined = new Int16Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

/** A complete 16-bit mono PCM WAV file. */
export function encodeWav(audio: PcmAudio): Uint8Array {
  const dataBytes = audio.samples.length * 2;
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(bytes.buffer);
  const writeId = (offset: number, id: string) => {
    for (let index = 0; index < 4; index++) view.setUint8(offset + index, id.charCodeAt(index));
  };
  writeId(0, "RIFF");
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  writeId(8, "WAVE");
  writeId(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeId(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < audio.samples.length; index++) view.setInt16(HEADER_BYTES + index * 2, audio.samples[index] ?? 0, true);
  return bytes;
}

export function durationSeconds(audio: PcmAudio): number {
  return audio.samples.length / audio.sampleRate;
}
