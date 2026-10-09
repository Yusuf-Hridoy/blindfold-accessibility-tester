// Turns a scan or journey result into the ordered list of sounds for the audio
// replay: what the screen reader said, a tick for every key press (so effort
// is audible), 1.5 s of silence for each silent update (BF-005), and a spoken
// marker for each page.

import { NOTHING_ANNOUNCED } from "../announcer/screen-reader-announcer.ts";
import { FOCUSED_ON_LOAD_PREFIX } from "../passes/keyboard-pass-walker.ts";
import type { JourneyResult, JourneyTranscriptEntry } from "../types/journey-result-types.ts";
import type { ScanResult } from "../types/scan-result-types.ts";

export type AudioSegment =
  | { kind: "speech"; text: string; language: string }
  | { kind: "tick" }
  /** A short gap between sounds, so they stay distinct. */
  | { kind: "pause"; milliseconds: number }
  /** Silence where something should have been announced and wasn't. */
  | { kind: "silence"; milliseconds: number; reason: string };

export const PAUSE_AFTER_TICK_MILLISECONDS = 120;
export const PAUSE_AFTER_SPEECH_MILLISECONDS = 250;
export const SILENT_UPDATE_MILLISECONDS = 1_500;

/** "checkout" for https://shop.example/checkout.html; the host for the home page. */
export function pageNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const lastPart = parsed.pathname.split("/").filter(Boolean).at(-1);
    return lastPart ? decodeURIComponent(lastPart).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ") : parsed.host;
  } catch {
    return url;
  }
}

class SegmentList {
  readonly segments: AudioSegment[] = [];

  tick(count = 1): void {
    for (let index = 0; index < count; index++) {
      this.segments.push({ kind: "tick" }, { kind: "pause", milliseconds: PAUSE_AFTER_TICK_MILLISECONDS });
    }
  }

  speak(text: string, language: string): void {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned === "") return;
    this.segments.push({ kind: "speech", text: cleaned, language }, { kind: "pause", milliseconds: PAUSE_AFTER_SPEECH_MILLISECONDS });
  }

  /** Screen reader output: each phrase spoken, without the live-region politeness label or "(nothing announced)". */
  speakAnnouncement(announcement: string, language: string): void {
    for (const phrase of announcement.replace(FOCUSED_ON_LOAD_PREFIX, "").split(" | ")) {
      const spoken = phrase.replace(/^(polite|assertive):\s*/i, "").trim();
      if (spoken !== NOTHING_ANNOUNCED) this.speak(spoken, language);
    }
  }

  silence(milliseconds: number, reason: string): void {
    this.segments.push({ kind: "silence", milliseconds, reason });
  }
}

export function scanToAudioSegments(result: ScanResult): AudioSegment[] {
  const list = new SegmentList();
  const language = result.pageLanguage;
  list.speak(`Page: ${result.pageTitle || pageNameFromUrl(result.url)}`, language);
  // A stop's step is the Tab press that produced it, so the gap between steps is the number of presses.
  let pressesSoFar = 0;
  for (const stop of result.focusStops) {
    list.tick(Math.max(0, stop.step - pressesSoFar));
    pressesSoFar = Math.max(pressesSoFar, stop.step);
    list.speakAnnouncement(stop.announcement, language);
  }
  // The last presses: onto the page body, or back to the first stop.
  list.tick(Math.max(0, result.tabPresses - pressesSoFar));
  return list.segments;
}

const PAGE_MARKERS: Record<NonNullable<JourneyTranscriptEntry["openedBy"]>, string> = {
  start: "Start page",
  navigation: "New page",
  "new-tab": "New tab",
};

/** Index of the transcript entry after which a step's silent updates go: its action key press. */
function silencePointForStep(transcript: JourneyTranscriptEntry[], step: number): number {
  const stepEntries = transcript.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.journeyStep === step);
  const lastOfKind = (kind: JourneyTranscriptEntry["kind"]) => stepEntries.filter(({ entry }) => entry.kind === kind).at(-1)?.index;
  return lastOfKind("key") ?? lastOfKind("typed") ?? stepEntries.at(-1)?.index ?? transcript.length - 1;
}

export function journeyToAudioSegments(result: JourneyResult): AudioSegment[] {
  const list = new SegmentList();
  const silencesAfter = new Map<number, string[]>();
  for (const finding of result.findings) {
    if (finding.ruleId !== "BF-005" || finding.journeyStep === undefined) continue;
    const point = silencePointForStep(result.transcript, finding.journeyStep);
    silencesAfter.set(point, [...(silencesAfter.get(point) ?? []), finding.message ?? finding.description]);
  }

  let language = "";
  for (const [index, entry] of result.transcript.entries()) {
    if (entry.kind === "page") {
      language = entry.language ?? language;
      list.speak(`${PAGE_MARKERS[entry.openedBy ?? "navigation"]}: ${entry.title || pageNameFromUrl(entry.url)}`, language);
    } else if (entry.kind === "focus") {
      list.tick();
      list.speakAnnouncement(entry.spoken ?? entry.text, language);
    } else if (entry.kind === "key") {
      list.tick();
    } else if (entry.kind === "speech") {
      list.speakAnnouncement(entry.text, language);
    } else if (entry.kind === "note") {
      list.speak(entry.text, language);
    }
    // Typed text is not a key press in the effort count, so it makes no sound.
    for (const reason of silencesAfter.get(index) ?? []) list.silence(SILENT_UPDATE_MILLISECONDS, reason);
  }
  return list.segments;
}
