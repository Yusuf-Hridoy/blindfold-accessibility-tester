import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  journeyToAudioSegments,
  pageNameFromUrl,
  scanToAudioSegments,
  SILENT_UPDATE_MILLISECONDS,
  type AudioSegment,
} from "../../src/audio/transcript-to-audio.ts";
import type { JourneyResult, JourneyTranscriptEntry } from "../../src/types/journey-result-types.ts";
import type { Finding, FocusStop, ScanResult } from "../../src/types/scan-result-types.ts";
import { startSnippetScanner, type SnippetScanner } from "../helpers/scan-html-snippet.ts";

/** The segments without pauses, as short labels: "tick", "say: …", "silence". */
function sounds(segments: AudioSegment[]): string[] {
  return segments
    .filter((segment) => segment.kind !== "pause")
    .map((segment) => (segment.kind === "speech" ? `say: ${segment.text}` : segment.kind));
}

function stop(step: number, announcement: string): FocusStop {
  return {
    elementId: step + 1,
    selector: `#s${step}`,
    description: `stop ${step}`,
    step,
    announcement,
    role: "button",
    accessibleName: "x",
    hiddenFromScreenReaders: false,
    focusVisible: true,
    focusStyleChanges: [],
  };
}

function scanResult(fields: Partial<ScanResult>): ScanResult {
  return { url: "http://shop.example/cart.html", pageTitle: "Your cart", pageLanguage: "en", focusStops: [], tabPresses: 0, ...fields } as ScanResult;
}

function entry(journeyStep: number, kind: JourneyTranscriptEntry["kind"], text: string, extra: Partial<JourneyTranscriptEntry> = {}): JourneyTranscriptEntry {
  return { journeyStep, kind, text, url: "http://shop.example/", ...extra };
}

function journeyResult(transcript: JourneyTranscriptEntry[], findings: Partial<Finding>[] = []): JourneyResult {
  return { transcript, findings } as unknown as JourneyResult;
}

describe("scanToAudioSegments", () => {
  it("starts with the page, then a tick before each stop's announcement, and ticks for the last presses", () => {
    const result = scanResult({
      focusStops: [stop(1, "link, Skip to main content"), stop(2, "button, Cart")],
      tabPresses: 3,
    });
    expect(sounds(scanToAudioSegments(result))).toEqual([
      "say: Page: Your cart",
      "tick",
      "say: link, Skip to main content",
      "tick",
      "say: button, Cart",
      "tick",
    ]);
  });

  it("has exactly one tick per Tab press, including presses inside a third-party frame", () => {
    const boundary = { ...stop(2, "Focus entered a frame from pay.example; Blindfold doesn't test third-party content."), frameBoundary: { origin: "pay.example", tabPressesInside: 3 } };
    const result = scanResult({ focusStops: [stop(1, "button, Before"), boundary, stop(5, "button, After")], tabPresses: 6 });
    expect(sounds(scanToAudioSegments(result)).filter((sound) => sound === "tick")).toHaveLength(6);
  });

  it("gives focus that was already there on load no tick, and drops labels a screen reader wouldn't speak", () => {
    const result = scanResult({
      focusStops: [stop(0, "(focused when the page loaded) button, Accept"), stop(1, "(nothing announced)"), stop(2, "button, Save | polite: Saved")],
      tabPresses: 2,
    });
    expect(sounds(scanToAudioSegments(result))).toEqual(["say: Page: Your cart", "say: button, Accept", "tick", "tick", "say: button, Save", "say: Saved"]);
  });

  it("names the page from its URL when it has no title, and speaks in the page's language", () => {
    const segments = scanToAudioSegments(scanResult({ pageTitle: "", pageLanguage: "de" }));
    expect(segments[0]).toEqual({ kind: "speech", text: "Page: cart", language: "de" });
    expect(pageNameFromUrl("http://shop.example/")).toBe("shop.example");
    expect(pageNameFromUrl("http://shop.example/linen-tote_bag.html")).toBe("linen tote bag");
  });
});

describe("journeyToAudioSegments", () => {
  const transcript = [
    entry(1, "page", "http://shop.example/product.html", { openedBy: "start", title: "Linen tote bag", language: "en" }),
    entry(1, "focus", "a.skip-link", { spoken: "link, Skip to main content" }),
    entry(1, "key", "Tab", { spoken: "(focus left the page)" }),
    entry(1, "focus", "button.add", { spoken: "button, Add to cart" }),
    entry(1, "typed", "ada@example.com"),
    entry(1, "key", "Enter"),
    entry(1, "speech", "polite: Added"),
    entry(2, "key", "Enter"),
    entry(2, "page", "http://shop.example/checkout.html", { openedBy: "navigation", title: "Checkout", language: "fr" }),
    entry(2, "note", "Opened a new tab: http://help.example/"),
    entry(2, "page", "http://help.example/", { openedBy: "new-tab", title: "", language: "", url: "http://help.example/" }),
  ];

  it("plays the transcript in order: page markers, ticks, speech, and silence where BF-005 found nothing announced", () => {
    const result = journeyResult(transcript, [{ ruleId: "BF-005", journeyStep: 1, message: '"added to cart" shown but never announced' }]);
    expect(sounds(journeyToAudioSegments(result))).toEqual([
      "say: Start page: Linen tote bag",
      "tick",
      "say: link, Skip to main content",
      "tick",
      "tick",
      "say: button, Add to cart",
      "tick",
      "silence",
      "say: Added",
      "tick",
      "say: New page: Checkout",
      "say: Opened a new tab: http://help.example/",
      "say: New tab: help.example",
    ]);
  });

  it("makes each silence 1.5 s and records why", () => {
    const result = journeyResult(transcript, [
      { ruleId: "BF-005", journeyStep: 2, message: "first" },
      { ruleId: "BF-005", journeyStep: 2, message: "second" },
    ]);
    const silences = journeyToAudioSegments(result).filter((segment) => segment.kind === "silence");
    expect(silences).toEqual([
      { kind: "silence", milliseconds: SILENT_UPDATE_MILLISECONDS, reason: "first" },
      { kind: "silence", milliseconds: SILENT_UPDATE_MILLISECONDS, reason: "second" },
    ]);
  });

  it("switches voice language with each page", () => {
    const languages = journeyToAudioSegments(journeyResult(transcript))
      .filter((segment) => segment.kind === "speech")
      .map((segment) => (segment.kind === "speech" ? segment.language : ""));
    expect(languages.slice(0, 2)).toEqual(["en", "en"]);
    expect(languages.at(-3)).toBe("fr");
    // A page without a lang attribute has no language (the English voice, with a note in the report).
    expect(languages.at(-1)).toBe("");
  });
});

describe("a real journey's audio", () => {
  let scanner: SnippetScanner;
  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });
  afterAll(async () => {
    await scanner.close();
  });

  it("has one tick per key press counted in the effort, including Tabs that land nowhere", async () => {
    // Step 1 walks a full cycle (past the page body) and is blocked; earlier steps press keys too.
    const outcome = await scanner.runJourney(
      `<a href="#top">Top</a><button>Save</button><div id="status"></div>
       <script>document.querySelector("button").addEventListener("click", () => setTimeout(() => (document.getElementById("status").textContent = "Saved"), 50));</script>`,
      [
        { reach: "Save, button", press: "Enter", expectAnnouncement: "Saved" },
        { reach: "Missing, button", press: "Enter" },
      ],
    );
    const { result } = outcome;
    expect(result.findings.map((finding) => finding.ruleId)).toContain("BF-005");
    const segments = journeyToAudioSegments(result);
    expect(segments.filter((segment) => segment.kind === "tick")).toHaveLength(result.effort.keyboardPresses);
    expect(segments.filter((segment) => segment.kind === "silence")).toHaveLength(1);
  });
});
