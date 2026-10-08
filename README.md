# Blindfold

Blindfold is a free, open-source tool that walks through websites using only a
keyboard and a screen reader, and reports where blind users would get stuck.

It opens a page in a headless browser and does two passes:

- a **mouse pass** that lists everything a mouse user can interact with, and
- a **keyboard pass** that presses Tab repeatedly, recording where focus lands
  and what a screen reader would announce.

Comparing the two reveals barriers such as unreachable controls, unnamed
buttons, focus traps and silent updates.

It can also run a **journey**: a user task written in YAML (add to cart, then
check out), performed step by step with only a keyboard while listening to what
a screen reader announces.

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
| `--time-limit <seconds>` | `120` | Stop the whole scan after this long |
| `--no-screenshots` | | Don't capture element screenshots |

Exit codes: `0` no barriers found · `1` barriers found · `2` the scan could not
be completed (bad URL, page didn't load, non-2xx response, browser crash,
invalid option, time limit).

Example, using the demo shops:

```sh
npm run demo:both
npm run blindfold -- scan "http://localhost:4000/cart.html?no-cookie-banner=1"
```

### Running a journey

```sh
npm run blindfold -- run <journey.yaml> [options]
```

| Option | Default | What it does |
|---|---|---|
| `--base-url <url>` | | Site address for journeys whose `start_url` is a path |
| `--output <folder>` | `./blindfold-results` | Where `report.html` and `report.json` are written |
| `--max-tabs-per-step <number>` | `100` | Give up reaching a step's target after this many Tab presses |
| `--page-timeout <seconds>` | `30` | How long to wait for each page to load |
| `--time-limit <seconds>` | `300` | Stop the whole journey after this long |
| `--no-screenshots` | | Don't capture element screenshots |

Exit codes: `0` journey passed with no barriers · `1` barriers found, or the
journey was blocked · `2` Blindfold couldn't complete (invalid journey file,
unreachable start URL, time limit, crash).

Example, using the demo shops:

```sh
npm run demo:both
npm run blindfold -- run example-journeys/buggy-shop-cart-journey.yaml --base-url http://localhost:4000
```

### Journey file format

```yaml
name: Product to checkout
start_url: /product-linen-tote-bag.html   # absolute URL, or a path resolved against --base-url
steps:
  - reach: "Add to cart, button"
    press: Enter
    expect_announcement: "added to cart"
  - reach: "Size guide, button"
    press: Enter
    expect_focus_inside: "Size guide"
  - press: Escape
    expect_closed: "Size guide"
    expect_focus_on: "Size guide, button"
  - type: "ada@example.com"
  - dismiss: "Accept, button"
```

| Field | Meaning |
|---|---|
| `reach: "<text>"` | Press Tab until the focused element matches. Matches `"<name>, <role>"` or just `"<name>"` (case and spacing ignored), or the screen reader's announcement in any order. If focus is already on a match, no Tab is pressed. |
| `press: <key>` | One key: `Enter`, `Space`, `Escape`, `ArrowUp/Down/Left/Right`, `Tab`, `Shift+Tab`. Can be used alone. |
| `type: "<text>"` | Types into the focused field. Typed characters don't count toward effort. |
| `dismiss: "<text>"` | `reach` + `press: Enter`, for overlays like cookie banners. Can't be combined with `reach` or `press`. |
| `expect_announcement: "<text>"` | The screen reader must say something containing the text within 1.5 s (live regions included). |
| `expect_focus_inside: "<name>"` | Focus must be inside an element (dialog, region, form…) whose accessible name contains the text. |
| `expect_focus_on: "<text>"` | The focused element must match, like `reach`. |
| `expect_closed: "<name>"` | No visible dialog or popup (menu, listbox, tooltip) whose accessible name contains the text may remain. |
| `expect_url_contains: "<text>"` | The page URL must contain the text. |

Within a step, Blindfold reaches first, then types, then presses the key, then
checks the expectations. Only a target that can't be reached blocks the
journey; failed expectations are recorded as barriers and the journey carries on.
Unknown fields are errors, so typos like `expect_anouncement` are caught.

The **effort ratio** compares key presses (Tab, Shift+Tab, arrows, Enter, Space,
Escape) with mouse clicks (one per step with `press` or `dismiss`). It measures
Tab navigation. Screen reader users also jump by headings and landmarks, so
their real effort can be lower; it's still a strong signal of how hard a page
is to use by keyboard.

### Rules checked in this version

| Rule | Barrier | WCAG | Checked by |
|---|---|---|---|
| BF-001 | Control can't be reached by keyboard | 2.1.1 | scan, journeys (when a target is never reached) |
| BF-002 | Control has no accessible name | 4.1.2 | scan, journeys |
| BF-003 | Keyboard focus gets trapped | 2.1.2 | scan, journeys |
| BF-004 | Keyboard focus is not visible | 2.4.7 | scan, journeys |
| BF-005 | Update is shown but not announced | 4.1.3 | journeys (`expect_announcement`) |
| BF-006 | Focus is lost after an action | 2.4.3 | journeys |
| BF-007 | Dialog opens without moving focus into it | 2.4.3 | journeys |
| BF-008 | Overlay blocks keyboard users | 2.1.1 | scan, journeys |

Blindfold finds likely keyboard and screen-reader barriers. It is not a legal
compliance verdict and does not replace testing with real screen readers.

## Known limitations

- A focus trap whose cycle includes the page's first focus stop is not detected
  yet (for example, a dialog that traps focus from the moment the page loads).
- Chromium only, desktop viewport 1280×800 only.
- Elements inside iframes and shadow DOM are not checked.
- Focus visibility is `unknown` (never reported) for an element that receives
  focus before Blindfold could record its unfocused styles, e.g. one inserted
  and focused by a script in the same moment, or one focused on page load.
- BF-008 decides whether an overlay's controls are keyboard-reachable from
  their markup (tabindex, disabled, inert, hidden), not by pressing Tab, so a
  journey's focus isn't disturbed.
- If the screen-reader engine can't start, BF-005 is decided from the markup
  alone (is the message in a live region?) and marked "lower confidence".
- Journeys: no login/sessions, iframes, new tabs or windows yet. An
  `expect_announcement` after a step that loads a new page can't hear the old
  page's announcements.

## Benchmark and development

- `demo-sites/buggy-shop`: the fictional Pebble & Pine shop with 8 planted
  accessibility bugs (see `PLANTED-BUGS.md`).
- `demo-sites/accessible-shop`: the same pages, built correctly (see
  `FIXES.md`).
- `spikes/`: the Phase 0 announcer spike, kept as a historical record.
- `example-journeys/`: three journeys that work against either demo shop with
  `--base-url`.

```sh
npm run demo:buggy        # buggy shop on http://localhost:4000
npm run demo:accessible   # accessible shop on http://localhost:4001
npm run demo:both         # both at once
npm run spike:announcer   # the Phase 0 announcer spike
npm run typecheck         # TypeScript check
npm test                  # all tests, including the exact benchmarks
```

Add `?no-cookie-banner=1` to a demo shop URL to skip the cookie banner.

## Licence

MIT. See `LICENSE`.
