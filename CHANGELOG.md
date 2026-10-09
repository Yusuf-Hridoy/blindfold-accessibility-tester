# Changelog

All notable changes to Blindfold are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (before 1.0, minor versions may
change behaviour).

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

[0.4.0]: https://github.com/Yusuf-Hridoy/blindfold-accessibility-tester/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Yusuf-Hridoy/blindfold-accessibility-tester/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Yusuf-Hridoy/blindfold-accessibility-tester/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Yusuf-Hridoy/blindfold-accessibility-tester/releases/tag/v0.1.0
