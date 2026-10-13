# Changelog

All notable changes to Blindfold are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (before 1.0, minor versions may
change behaviour).

## [0.6.0] - 2026-10-13

0.5.0 was never published; its changes are part of this release.

### Added
- A confidence level on every finding: `certain`, `likely` or `check by hand`,
  decided from the evidence (e.g. a `<div>` with a click listener and no
  tabindex is certainly unreachable; a link with `tabindex="-1"` should be
  checked by hand). Shown in the terminal, the HTML report (with a legend),
  report.json, the web UI and the Action's job summary. Reports written before
  0.6.0 load with "unknown". Exit codes don't change.
- A real-world corpus to measure precision: the W3C ARIA Authoring Practices
  examples (expected: no findings), the W3C Before-and-After Demonstration and
  about 20 real sites. `npm run corpus` scans it one page at a time;
  `npm run corpus:report` writes `corpus/CORPUS-REPORT.md` with precision per
  rule and per confidence level from the owner's verdicts. A monthly workflow
  runs it; it never runs with `npm test`.
- `blindfold ui`: a local web UI for people who don't use a terminal. Scan a
  URL (desktop or mobile, audio on or off) or run a journey from the journeys
  folder, watch live progress (each focus stop, what the screen reader said,
  each barrier), cancel, open the report and audio, browse the history of runs
  and compare two of them. Options: `--port` (default 4321, falls back to a
  free port), `--results` (default `./blindfold-ui-results`), `--journeys`
  (default `./example-journeys` when it exists) and `--no-open`.
- The UI is local only: it listens on 127.0.0.1, needs the random session
  token from the printed link (403 without it), refuses other Host headers
  (DNS rebinding) and cross-origin POSTs, sends no CORS headers, serves files
  only from the results folder and runs one scan at a time (409).
- `scanPage` and `runJourney` take an optional `onProgress` callback (live
  progress events) and an `AbortSignal` (cancel: the browser closes and no
  report is written). Neither changes a run's result.

### Changed
- The CLI's scan and journey commands now share their run-and-write code with
  the web UI. Output, reports and exit codes are unchanged.
- Scan reports have a `warnings` list. When more than half of the clickable
  elements are BF-001, it says the keyboard walk may have been incomplete and
  the results should be checked by hand (terminal, HTML report, JSON and web
  UI). The findings are kept.

### Fixed
- False BF-001 for most of a page when the page focuses something at load
  near the end of the DOM (typically a cookie banner). The walk stopped as soon
  as focus reached the end of the page, so everything above the banner was
  never visited. A walk that starts on an element focused at load now wraps
  around to the top and stops after one full cycle (back at an element it
  visited before wrapping). A focus trap met after wrapping is still reported
  as BF-003. Walks that start at the top of the page are unchanged.
- No BF-001 for a link taken out of the Tab order (e.g. a card's title link
  with `tabindex="-1"`) when a keyboard-reachable link on the page goes to the
  same address. It's listed under "Not tested" as "duplicate link removed from
  Tab order; the same destination is reachable". For links to another page
  the `#fragment` is ignored; links to sections of the same page must match
  exactly.

## [0.4.0] - 2026-10-09

### Added
- Installable npm package `blindfold-a11y` with a `blindfold` command, compiled
  to `dist/` (`npm run build`). The package contains only `dist/`, the README,
  the licence and this changelog.
- `blindfold compare <old-report.json> <new-report.json>`: fixed, new and
  still-present barriers (matched by rule, reason and selector, then by element
  description and accessible name), journey outcome and effort changes, and
  `comparison.html` / `comparison.json`. Exits 1 when there are new barriers.
- GitHub Action (`action.yml`, Linux runners): scan or run a journey, optionally
  start your app and wait for it, compare with a baseline, upload the reports
  and write a job summary. `fail-on`: `findings`, `new-findings` or `never`.
- A clear message when Chromium isn't installed:
  `Chromium isn't installed. Run: npx playwright@1.64.0 install chromium` (exit code 2).
- Packaged smoke test: builds, packs and installs the package into an empty
  folder, then runs it against the demo shops.

### Changed
- Playwright is pinned to exactly 1.64.0, so Blindfold and its Chromium build
  always match. Playwright and the screen-reader engine are now runtime
  dependencies.
- README rewritten for new users, with the benchmark results.

### Fixed
- BF-001 no longer fires for controls that Tab skips on purpose because arrow
  keys reach them, in both `scan` and journeys: the other radios of a native
  radio group (same name and form) when one radio of the group was a focus stop,
  and the items of ARIA widgets that use arrow keys (`radiogroup`, `tablist`,
  `menu`, `menubar`, `toolbar`, `listbox`, `grid`, `tree`, `treegrid`) when the
  widget had a focus stop. The ARIA items are listed under "Not tested" as
  "assumed reachable with arrow keys, not verified", because Blindfold doesn't
  press arrow keys (that can change a selection).

## [0.3.0] - 2026-10-09

### Added
- Audio replay (`blindfold-audio.wav`, with a player in the report): spoken
  announcements (espeak-ng, optional), a tick per key press, silence for each
  silent update (BF-005) and page markers. `--no-audio` turns it off.
- `--viewport mobile` (390×844) for `scan` and `run`, and `viewport:` in journey
  files. The demo shops gained a responsive menu with a mobile-only planted bug.
- `blindfold login` and `--session` for pages behind a login.
- iframes: same-origin frames are tested like the page (selectors such as
  `iframe#reviews >>> button.vote`); third-party frames are recorded as a
  boundary.
- New tabs opened by a journey action are recorded; `follow_new_tab: true`
  continues the journey there.
- Clearer messages when a journey target is never reached (close the dialog
  first; no "Did you mean" after a trap).

### Changed
- After a focus trap, unreached controls before the trap are reported as
  BF-001; only those after it are "not tested".

### Fixed
- The CLI no longer waits about 10 seconds before exiting.

## [0.2.0] - 2026-10-08

### Added
- Journeys: `blindfold run <journey.yaml>` performs a user task step by step
  with only a keyboard (`reach`, `press`, `type`, `dismiss` and `expect_*`
  checks), across page loads.
- Rules BF-005 (update not announced), BF-006 (focus lost after an action),
  BF-007 (dialog opens without focus) and BF-008 (overlay blocks keyboard users).
- Effort ratio (key presses vs mouse clicks) and `--time-limit`.

### Fixed
- A journey step that starts inside a focus trap reports BF-003, and never
  reports BF-001 for a control the keyboard already reached.

## [0.1.0] - 2026-10-08

### Added
- `blindfold scan <url>`: a mouse pass and a keyboard pass with a virtual
  screen reader, and an accessible `report.html` plus `report.json`.
- Rules BF-001 (can't be reached by keyboard), BF-002 (no accessible name),
  BF-003 (focus trap) and BF-004 (focus not visible).
- The Pebble & Pine demo shops (buggy and accessible) and exact benchmark tests.

### Fixed
- BF-001 only fires for elements a mouse can actually click (hit test), and
  BF-002 tells a missing name apart from a control hidden from screen readers.

[0.6.0]: https://github.com/Yusuf-Hridoy/blindfold-accessibility-tester/compare/v0.4.0...v0.6.0
[0.4.0]: https://github.com/Yusuf-Hridoy/blindfold-accessibility-tester/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Yusuf-Hridoy/blindfold-accessibility-tester/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Yusuf-Hridoy/blindfold-accessibility-tester/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Yusuf-Hridoy/blindfold-accessibility-tester/releases/tag/v0.1.0
