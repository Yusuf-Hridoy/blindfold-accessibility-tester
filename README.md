# Blindfold

Blindfold is a free, open-source tool that walks through websites using only a
keyboard and a screen reader, and reports where blind users would get stuck.

It opens a page in a headless browser and does two passes:

- a **mouse pass** that lists everything a mouse user can interact with, and
- a **keyboard pass** that presses Tab repeatedly, recording where focus lands
  and what a screen reader would announce.

Comparing the two reveals barriers such as unreachable controls, unnamed
buttons, focus traps and silent updates.

## Usage

You need Node 22.12 or newer.

```sh
npm install
npx playwright install chromium

npm run blindfold -- scan <url> [options]
```

Options:

| Option | Default | What it does |
|---|---|---|
| `--output <folder>` | `./blindfold-results` | Where `report.html` and `report.json` are written |
| `--max-tabs <number>` | `400` | Stop the keyboard walk after this many Tab presses |
| `--page-timeout <seconds>` | `30` | How long to wait for the page to load |
| `--no-screenshots` | | Don't capture element screenshots |

Exit codes: `0` no barriers found · `1` barriers found · `2` the scan could not
be completed (bad URL, page didn't load, non-2xx response, browser crash,
invalid option).

Example, using the demo shops:

```sh
npm run demo:both
npm run blindfold -- scan "http://localhost:4000/cart.html?no-cookie-banner=1"
```

Rules checked in this version:

| Rule | Barrier | WCAG |
|---|---|---|
| BF-001 | Control can't be reached by keyboard | 2.1.1 |
| BF-002 | Control has no accessible name | 4.1.2 |
| BF-003 | Keyboard focus gets trapped | 2.1.2 |
| BF-004 | Keyboard focus is not visible | 2.4.7 |

Blindfold finds likely keyboard and screen-reader barriers. It is not a legal
compliance verdict and does not replace testing with real screen readers.

## Known limitations

- A focus trap whose cycle includes the page's first focus stop is not detected
  yet (for example, a dialog that traps focus from the moment the page loads).
- Chromium only, desktop viewport 1280×800 only.
- Elements inside iframes and shadow DOM are not checked.
- Focus visibility is `unknown` (never reported) for an element that receives
  focus before Blindfold could record its unfocused styles, e.g. one inserted
  and focused by a script in the same moment.

## Benchmark and development

- `demo-sites/buggy-shop`: the fictional Pebble & Pine shop with 8 planted
  accessibility bugs (see `PLANTED-BUGS.md`).
- `demo-sites/accessible-shop`: the same pages, built correctly (see
  `FIXES.md`).
- `spikes/`: the Phase 0 announcer spike, kept as a historical record.

```sh
npm run demo:buggy        # buggy shop on http://localhost:4000
npm run demo:accessible   # accessible shop on http://localhost:4001
npm run demo:both         # both at once
npm run spike:announcer   # the Phase 0 announcer spike
npm run typecheck         # TypeScript check
npm test                  # all tests, including the exact benchmark
```

Add `?no-cookie-banner=1` to a demo shop URL to skip the cookie banner.

## Licence

MIT. See `LICENSE`.
