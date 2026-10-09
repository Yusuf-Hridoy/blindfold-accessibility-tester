# Blindfold

Blindfold walks through your website using only a keyboard and a screen reader,
and reports where blind and keyboard-only users would get stuck. It's free,
open source (MIT) and runs locally or in CI.

**Why:** static accessibility scanners read the markup of one page. They can't
tell you that the "Checkout" control can't be reached with Tab, that focus gets
trapped in the newsletter box, or that "Added to cart" appears on screen but is
never announced. Those barriers only show up when you *use* the site, step by
step, the way a screen reader user does, and that's what Blindfold does.

## Install

You need Node 22.12 or newer.

```sh
# Once the package is published:
npm install -g blindfold-a11y        # then run: blindfold scan <url>
# or, without installing:
npx blindfold-a11y scan <url>

# Blindfold drives Chromium through Playwright. Install the matching browser once:
npx playwright@1.64.0 install chromium
```

If Chromium is missing, Blindfold stops with exit code 2 and tells you the
exact command: `Chromium isn't installed. Run: npx playwright@1.64.0 install chromium`.

**Optional, for the audio replay:** install [espeak-ng](https://github.com/espeak-ng/espeak-ng).

| System | Install |
|---|---|
| macOS | `brew install espeak-ng` |
| Debian / Ubuntu | `sudo apt-get install espeak-ng` |
| Fedora | `sudo dnf install espeak-ng` |
| Windows | Run the installer from the [espeak-ng releases](https://github.com/espeak-ng/espeak-ng/releases) and make sure `espeak-ng` is on the `PATH`. |

Without espeak-ng everything else works; Blindfold prints `Audio skipped:
espeak-ng not found…` and carries on.

## Quick start

Scan one page:

```console
$ blindfold scan "http://localhost:4000/cart.html?no-cookie-banner=1"
Blindfold 0.4.0 · scan · http://localhost:4000/cart.html?no-cookie-banner=1
Engine: Guidepup virtual screen reader

  ✗ BF-001  Control can't be reached by keyboard       1 element
  ✗ BF-002  Control has no accessible name             1 element
  ✗ BF-004  Keyboard focus is not visible              4 elements

  3 rules failed · 6 elements · 9 focus stops · 1.1s
  Report: blindfold-results/report.html
  Audio:  blindfold-results/blindfold-audio.wav (22 s)
```

Run a journey (a user task written in YAML):

```console
$ blindfold run example-journeys/buggy-shop-cart-journey.yaml --base-url http://localhost:4000
Blindfold 0.4.0 · run · Cart, remove an item and check out
Engine: Guidepup virtual screen reader

  ✓ step 1  reach "Remove Linen tote bag, button" + Enter    9 keys
  ✗ step 1  BF-004 Keyboard focus is not visible: a.nav-link "Shop"
  ✗ step 1  BF-004 Keyboard focus is not visible: a.nav-link "Tote bag"
  ✗ step 1  BF-004 Keyboard focus is not visible: a.nav-link "Cart"
  ✗ step 1  BF-004 Keyboard focus is not visible: a.nav-link "Checkout"
  ✗ step 1  BF-002 Control has no accessible name: button.cart-button
  ✗ step 1  BF-006 focus fell back to the page after Enter on button.remove-button "Remove Linen tote bag"
  ✗ step 2  reach "Checkout, button" + Enter                 10 keys
  ✗ step 2  blocked: "Checkout, button" was never reached: a full Tab cycle went by without reaching it
            Did you mean "Checkout, link"?
  ✗ step 2  BF-001 "Checkout, button" exists for the mouse but can't be reached by keyboard

  Journey blocked at step 2 · effort 19 keys vs 2 clicks (9.5×), until blocked · 1.2s
  Report: journey/report.html
  Audio:  journey/blindfold-audio.wav (41 s)
```

These examples use the demo shops in this repository (see
[Development](#development)). Open `report.html` for the details: each barrier
with a screenshot, what the screen reader said around it, why it matters and
how to fix it, plus the full keyboard transcript and an audio player.

## Commands

Exit codes for every command: `0` no barriers (or none new) · `1` barriers found
(or a journey was blocked, or new barriers in `compare`) · `2` Blindfold
couldn't complete (bad URL or file, page didn't load or returned non-2xx,
Chromium missing, invalid option, time limit).

### `blindfold scan <url>`

Opens the page in headless Chromium, lists everything a mouse can use, then
presses Tab until focus wraps around, recording where focus lands and what the
screen reader announces. Writes `report.html`, `report.json` and
`blindfold-audio.wav`.

| Option | Default | What it does |
|---|---|---|
| `--output <folder>` | `./blindfold-results` | Where the reports are written |
| `--max-tabs <number>` | `400` | Stop the keyboard walk after this many Tab presses |
| `--page-timeout <seconds>` | `30` | How long to wait for the page to load |
| `--time-limit <seconds>` | `120` | Stop the whole scan after this long |
| `--viewport <name>` | `desktop` | `desktop` (1280×800) or `mobile` (390×844) |
| `--session <file>` | | Load a login saved with `blindfold login` |
| `--no-screenshots` | | Don't capture element screenshots |
| `--no-audio` | | Don't write the audio replay |

### `blindfold run <journey.yaml>`

Performs a journey step by step with only a keyboard, across pages and new
tabs, and reports barriers per step plus the **effort ratio** (key presses vs
mouse clicks).

| Option | Default | What it does |
|---|---|---|
| `--base-url <url>` | | Site address for journeys whose `start_url` is a path |
| `--output <folder>` | `./blindfold-results` | Where the reports are written |
| `--max-tabs-per-step <number>` | `100` | Give up reaching a step's target after this many Tab presses |
| `--page-timeout <seconds>` | `30` | How long to wait for each page to load |
| `--time-limit <seconds>` | `300` | Stop the whole journey after this long |
| `--viewport <name>` | from the file, else `desktop` | Overrides the journey file's `viewport` |
| `--session <file>` | | Load a login saved with `blindfold login` |
| `--no-screenshots` | | Don't capture element screenshots |
| `--no-audio` | | Don't write the audio replay |

### `blindfold compare <old-report.json> <new-report.json>`

Compares two scan reports or two journey reports and lists what was **fixed**,
what is **new** and what is **still present**. For journeys it also compares
the outcome ("was blocked at step 2, now passes") and the effort ratio. Writes
`comparison.html` and `comparison.json`; exits 1 if there is at least one new
barrier.

```console
$ blindfold compare before/report.json after/report.json
Blindfold 0.4.0 · compare
  ✓ 0 fixed    ✗ 6 new    • 0 still present
  ✗ new  BF-001  Control can't be reached by keyboard: div.checkout-button "Checkout"
  ✗ new  BF-002  Control has no accessible name: button.cart-button
  …
```

| Option | Default | What it does |
|---|---|---|
| `--output <folder>` | `./blindfold-results` | Where `comparison.html` and `comparison.json` are written |

Findings are matched by rule, reason (for BF-002) and CSS selector. When a
selector changed, Blindfold falls back to rule, reason, element description and
accessible name. Reports of different kinds can't be compared (exit 2); reports
of different pages, journeys or viewports are compared with a warning.

### `blindfold login <url> --save-session <file>`

For pages behind a login. Opens a **visible** browser; log in by hand, then
close the window. Blindfold saves the browser's cookies and local storage to
the file (readable only by you), and `--session <file>` loads them into `scan`
and `run`.

```sh
blindfold login https://example.com/login --save-session my-site.session.json
blindfold scan https://example.com/account --session my-site.session.json
```

**The session file contains your login. Don't commit or share it.** Name it
`*.session.json` and add that pattern to your `.gitignore`.

## Journey file format

```yaml
name: Product to checkout
start_url: /product-linen-tote-bag.html   # absolute URL, or a path resolved against --base-url
viewport: desktop                         # optional: desktop (default) or mobile
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
  - reach: "Help centre, link"
    press: Enter
    follow_new_tab: true
    expect_url_contains: "/help"
```

| Field | Meaning |
|---|---|
| `name` | The journey's name, shown in reports. |
| `start_url` | Where the journey starts: an absolute URL, or a path resolved against `--base-url`. |
| `viewport` | Optional: `desktop` (default) or `mobile`. `--viewport` overrides it. |
| `reach: "<text>"` | Press Tab until the focused element matches. Matches `"<name>, <role>"` or just `"<name>"` (case and spacing ignored), or the screen reader's announcement in any order. If focus is already on a match, no Tab is pressed. |
| `press: <key>` | One key: `Enter`, `Space`, `Escape`, `ArrowUp/Down/Left/Right`, `Tab`, `Shift+Tab`. Can be used alone. |
| `type: "<text>"` | Types into the focused field. Typed characters don't count toward effort. |
| `dismiss: "<text>"` | `reach` + `press: Enter`, for overlays like cookie banners. Can't be combined with `reach` or `press`. |
| `expect_announcement: "<text>"` | The screen reader must say something containing the text within 1.5 s (live regions included). |
| `expect_focus_inside: "<name>"` | Focus must be inside an element (dialog, region, form…) whose accessible name contains the text. |
| `expect_focus_on: "<text>"` | The focused element must match, like `reach`. |
| `expect_closed: "<name>"` | No visible dialog or popup (menu, listbox, tooltip) whose accessible name contains the text may remain. |
| `expect_url_contains: "<text>"` | The page URL must contain the text. |
| `follow_new_tab: true` | The step's action opens a new tab and the journey continues there. If no tab opens, that's a barrier ("expected a new tab to open"). Without it, a tab the action opens is recorded and closed. |

Within a step, Blindfold reaches first, then types, then presses the key, then
checks the expectations. Only a target that can't be reached blocks the
journey; failed expectations are recorded as barriers and the journey carries
on. Unknown fields are errors, so typos like `expect_anouncement` are caught.

When a target is never reached, the step says why: after an ordinary full Tab
cycle it suggests the closest thing heard (`Did you mean "Checkout, link"?`);
inside a modal dialog it says to close the dialog first; after a focus trap the
BF-003 finding explains it.

The **effort ratio** compares key presses (Tab, Shift+Tab, arrows, Enter,
Space, Escape) with mouse clicks (one per step with `press` or `dismiss`). It
measures Tab navigation; screen reader users also jump by headings and
landmarks, so their real effort can be lower, but it's a strong signal of how
hard a page is to use by keyboard.

## Rules

| Rule | What it catches | WCAG |
|---|---|---|
| BF-001 | A control a mouse can use but the keyboard can't reach | 2.1.1 Keyboard (A) |
| BF-002 | A control with no accessible name, or hidden from screen readers while focusable | 4.1.2 Name, Role, Value (A) |
| BF-003 | Keyboard focus gets trapped | 2.1.2 No Keyboard Trap (A) |
| BF-004 | Keyboard focus is not visible | 2.4.7 Focus Visible (AA) |
| BF-005 | An update is shown but never announced (journeys) | 4.1.3 Status Messages (AA) |
| BF-006 | Focus is lost after an action (journeys) | 2.4.3 Focus Order (A) |
| BF-007 | A dialog opens without moving focus into it (journeys) | 2.4.3 Focus Order (A) |
| BF-008 | An overlay blocks keyboard users | 2.1.1 Keyboard (A) |

### What else Blindfold covers

- **Audio replay** (`blindfold-audio.wav`, with a player in the report): each
  screen-reader announcement spoken by espeak-ng, a soft tick for every key
  press so effort is audible, 1.5 s of real silence for each silent update
  (BF-005), and a spoken marker for each page. The voice follows the page's
  `lang` when espeak-ng has a voice for it, otherwise English.
- **Mobile viewport** (`--viewport mobile`): 390×844 with the phone layout and
  touch off, since Blindfold tests keyboard users (e.g. a Bluetooth keyboard or
  switch access on a phone).
- **iframes:** same-origin frames are tested like the page, with selectors such
  as `iframe#reviews >>> button.vote` (the part after `>>>` is a CSS selector
  inside the frame). Third-party frames are a boundary: the transcript records
  focus entering and leaving, Tab presses inside count as effort, and nothing
  inside is reported.
- **New tabs** opened by a journey action are recorded; `follow_new_tab: true`
  continues the journey there.

## How we know it works

Blindfold is tested against two copies of a small fictional shop, Pebble &
Pine. The **buggy shop** has one planted bug per rule (plus one mobile-only
bug); the **accessible shop** has the same pages with every bug fixed. The
benchmark tests require **exactly** these results: no missed bugs, no extra
findings, and no findings at all on the accessible shop.

**Desktop scans (1280×800)**

| Page | Buggy shop | Accessible shop |
|---|---|---|
| `index.html` | BF-002 cart button · BF-003 newsletter box (email field ↔ Subscribe) · BF-004 the 4 nav links | none |
| `product-linen-tote-bag.html` | BF-002 cart button · BF-004 the 4 nav links | none |
| `cart.html` | BF-001 Checkout `<div>` · BF-002 cart button · BF-004 the 4 nav links | none |
| `checkout.html` | BF-002 cart button · BF-004 the 4 nav links | none |
| `index.html` with the cookie banner | BF-008 cookie banner (Accept and Reject are `<span>`s) | none |

**Journeys (desktop)**

| Journey | Buggy shop | Accessible shop |
|---|---|---|
| Product: add to cart, size guide | Completed with barriers. Step 1: BF-002 cart button, BF-004 nav links, BF-005 "added to cart" not announced. Step 2: BF-007 size guide. Step 3: `expect_closed` failed. Effort 12 keys vs 3 clicks (4×) | Passed · 12 vs 3 (4×) |
| Cart: remove an item, check out | Blocked at step 2. Step 1: BF-002, BF-004, BF-006 focus lost after Remove. Step 2: BF-001 Checkout. Effort 19 vs 2 (9.5×), until blocked | Passed · 11 vs 2 (5.5×) |
| First visit: cookie banner, then product | Blocked at step 1: BF-008 cookie banner. Effort 2 vs 1 (2×), until blocked | Passed · 3 vs 2 (1.5×) |
| Into the newsletter trap (buggy only) | Blocked at step 2. Step 1: BF-002, BF-004. Step 2: BF-003 email field ↔ Subscribe, no BF-001. Effort 12 vs 1 (12×), until blocked | — |

**Mobile (390×844)**

| Page or journey | Buggy shop | Accessible shop |
|---|---|---|
| `index.html` | BF-001 menu toggle · BF-002 cart button · BF-003 newsletter box | none |
| `product-linen-tote-bag.html` | BF-001 menu toggle · BF-002 cart button | none |
| `cart.html` | BF-001 menu toggle and Checkout · BF-002 cart button | none |
| `checkout.html` | BF-001 menu toggle · BF-002 cart button | none |
| Journey: open the menu, then the cart | Blocked at step 1: BF-001 menu toggle, BF-002 cart button. Effort 7 vs 1 (7×), until blocked | Passed, ends on the cart · 8 vs 2 (4×) |

(On mobile the nav links are hidden in the collapsed menu, so BF-004 can't fire
there.) On a real, well-built site, a scan of https://github.com/ reports **0
findings**.

## GitHub Action

Run Blindfold on every pull request. The Action installs Blindfold and
Chromium, can start your app, uploads the reports as an artifact, and writes a
job summary (verdict, findings with WCAG criteria, effort, comparison totals).
It supports **Linux runners only** (`ubuntu-latest`).

Minimal example:

```yaml
name: Accessibility
on: [pull_request]

jobs:
  blindfold:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Yusuf-Hridoy/blindfold-accessibility-tester@v0
        with:
          target: http://localhost:3000/
          start-command: npm ci && npm start
          wait-for-url: http://localhost:3000/
```

Only fail on **new** barriers, compared with a baseline report you keep in the
repository (download `report.json` from an earlier run's artifact to create or
refresh it):

```yaml
      - uses: Yusuf-Hridoy/blindfold-accessibility-tester@v0
        with:
          command: run
          target: accessibility/checkout-journey.yaml
          base-url: http://localhost:3000
          start-command: npm ci && npm start
          wait-for-url: http://localhost:3000/
          baseline: accessibility/baseline-report.json
          fail-on: new-findings
```

| Input | Default | Meaning |
|---|---|---|
| `command` | `scan` | `scan` or `run` |
| `target` | (required) | The URL for `scan`, the journey file for `run` |
| `base-url` | | For journeys with a path `start_url` |
| `viewport` | | `desktop` or `mobile`. Empty: desktop for `scan`, the journey file's choice for `run` |
| `start-command` | | Starts your app in the background; it's stopped at the end, even on failure |
| `wait-for-url` | | Waits up to 60 s for this URL to answer before testing |
| `baseline` | | A previous `report.json`; if set, the run is also compared with it |
| `fail-on` | `findings` | `findings`, `new-findings` (needs `baseline`) or `never` |
| `output` | `blindfold-results` | Report folder |
| `artifact-name` | `blindfold-results` | Name of the uploaded artifact (must be unique if you use the Action more than once in a workflow) |

Outputs: `exit-code`, `compare-exit-code`, `report-folder`. Audio is off in the
Action (most CI machines don't have espeak-ng). If Blindfold itself can't
complete (exit code 2, e.g. the app never started), the step always fails,
even with `fail-on: never`.

## Known limitations

- A focus trap whose cycle includes the page's first focus stop is not detected
  yet (for example, a dialog that traps focus from the moment the page loads).
- After a focus trap, unreached controls *before* the trap (in document order)
  are reported as BF-001, because Tab passed their position. Controls after it
  are listed as "not tested".
- Tab skips the other radios of a radio group and the items of widgets that
  use arrow keys (tabs, menus, listboxes, grids, trees, toolbars), so those
  aren't BF-001 when the group or widget was reached. Blindfold doesn't press
  arrow keys to confirm it (that can change a selection): native radio groups
  are reachable by browser design, and ARIA widget items are listed under
  "Not tested" as "assumed reachable with arrow keys, not verified".
- Chromium only. Two viewports: desktop 1280×800 and mobile 390×844 (no touch).
- Shadow DOM is not checked. The mouse pass doesn't look inside iframes, so
  BF-001 can't fire for controls inside a frame (BF-002, BF-003 and BF-004
  can). Nothing inside third-party iframes is tested.
- Focus visibility is `unknown` (never reported) for an element that receives
  focus before Blindfold could record its unfocused styles, e.g. one inserted
  and focused by a script in the same moment, or one focused on page load.
- BF-008 decides whether an overlay's controls are keyboard-reachable from
  their markup (tabindex, disabled, inert, hidden), not by pressing Tab, so a
  journey's focus isn't disturbed.
- If the screen-reader engine can't start, BF-005 is decided from the markup
  alone (is the message in a live region?) and marked "lower confidence".
- Journeys: when Tab brings focus back to where a step started without
  passing the end of the page, Blindfold reports a focus trap (BF-003), unless
  focus is legitimately kept inside a modal: an open `<dialog>`, a
  `role="dialog"`/`"alertdialog"` with `aria-modal="true"`, or a container
  where everything else on the page is `inert` or `aria-hidden`. A modal that
  traps focus without those markers is reported as a trap.
- Journeys: an `expect_announcement` after a step that loads a new page (or
  follows a new tab) can't hear the old page's announcements.
- Sessions: Blindfold can't tell that a saved login has expired. If the site
  then shows its login page instead, that page is what gets tested.
- Audio replay: espeak-ng's voice is not a real screen reader's voice or
  wording; the text is Blindfold's transcript. Typed text makes no sound (it
  doesn't count toward effort either).
- Audio replay quality: the current espeak-ng output can be hard to
  understand; improving it is planned.
- `compare` matches findings by selector, then by element description and
  accessible name. If both the selector and the description change (e.g. a
  button is renamed and moved), the same barrier shows as one fixed and one
  new. Journey reports don't record accessible names, so for journeys the
  fallback uses the description alone.
- The GitHub Action supports Linux runners only.
- Blindfold uses exactly Playwright 1.64.0, so its Chromium must be installed
  with `npx playwright@1.64.0 install chromium`.

## Research

Blindfold builds on research into testing web pages the way screen reader users
actually navigate them:

- **A11yLTLNav** (arXiv, 2026): <https://arxiv.org/abs/2609.17959>
- **A11yNavigator** (ASE 2025), an earlier tool that simulates NVDA navigation
  to find elements screen-reader users can't locate or activate:
  <https://conf.researchr.org/details/ase-2025/ase-2025-papers/192/Automated-Detection-of-Web-Application-Navigation-Barriers-for-Screen-Reader-Users>

Blindfold differs in that it runs without a real screen reader (it uses a
virtual one), on any operating system and in CI, and adds multi-step journeys,
effort scores and before/after comparison.

## Development

```sh
git clone https://github.com/Yusuf-Hridoy/blindfold-accessibility-tester.git
cd blindfold-accessibility-tester
npm install
npx playwright install chromium

npm run blindfold -- scan <url>   # run from source (tsx)
npm run demo:both                 # buggy shop on :4000, accessible shop on :4001
npm run typecheck                 # TypeScript check
npm test                          # all tests, including the exact benchmarks
npm run build                     # compile to dist/ (what the npm package ships)
```

- `demo-sites/buggy-shop`: the Pebble & Pine shop with the planted bugs (see
  `PLANTED-BUGS.md`); `demo-sites/accessible-shop`: the fixed copy (see
  `FIXES.md`). Add `?no-cookie-banner=1` to a URL to skip the cookie banner.
- `example-journeys/`: journeys that work against either demo shop with
  `--base-url`.
- `tests/package/packaged-cli-smoke.test.ts` builds and packs the package,
  installs it into an empty folder and runs it, so it needs the npm registry
  (or npm's cache). Set `BLINDFOLD_SKIP_PACKAGE_TEST=1` to skip it locally; CI
  always runs it.
- `spikes/`: the Phase 0 announcer spike, kept as a historical record.

## Disclaimer and licence

Blindfold finds likely keyboard and screen-reader barriers. It is not a legal
compliance verdict, and it doesn't replace testing with real screen readers
and with disabled people.

MIT. See `LICENSE`.
