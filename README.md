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

Every scan and journey also gets an **audio replay** (`blindfold-audio.wav`):
what the screen reader said, a soft tick for every key press, and silence where
an update should have been announced, so you can hear what the visit was like.

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
| `--no-audio` | | Don't write the audio replay |
| `--viewport <name>` | `desktop` | `desktop` (1280×800) or `mobile` (390×844, phone layout, no touch: Blindfold tests keyboard users) |
| `--session <file>` | | Load a login saved with `login` (see [Logged-in pages](#logged-in-pages)) |

Exit codes: `0` no barriers found · `1` barriers found · `2` the scan could not
be completed (bad URL, page didn't load, non-2xx response, browser crash,
invalid option, missing or invalid session file, time limit).

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
| `--no-audio` | | Don't write the audio replay |
| `--viewport <name>` | from the file, else `desktop` | `desktop` or `mobile`; overrides the journey file's `viewport` |
| `--session <file>` | | Load a login saved with `login` |

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
    follow_new_tab: true                  # the link opens a new tab; continue there
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
| `follow_new_tab: true` | The step's action opens a new tab (e.g. a `target="_blank"` link) and the journey continues there. If no tab opens, that's a barrier ("expected a new tab to open"). Without it, a tab the action opens is recorded on the step and closed, and the journey stays put. |

Within a step, Blindfold reaches first, then types, then presses the key, then
checks the expectations. Only a target that can't be reached blocks the
journey; failed expectations are recorded as barriers and the journey carries on.
Unknown fields are errors, so typos like `expect_anouncement` are caught.

The **effort ratio** compares key presses (Tab, Shift+Tab, arrows, Enter, Space,
Escape) with mouse clicks (one per step with `press` or `dismiss`). It measures
Tab navigation. Screen reader users also jump by headings and landmarks, so
their real effort can be lower; it's still a strong signal of how hard a page
is to use by keyboard.

When a target is never reached, the step says why: after an ordinary full Tab
cycle it suggests the closest thing heard (`Did you mean "Checkout, link"?`);
inside a modal dialog it says to close the dialog first; after a focus trap the
BF-003 finding explains it.

### Audio replay

After each scan or journey, Blindfold writes `blindfold-audio.wav` next to the
reports, and `report.html` gets a player for it. You hear, in order:

- each screen-reader announcement, spoken by [espeak-ng](https://github.com/espeak-ng/espeak-ng);
- a short soft tick for every key press, so effort is audible;
- 1.5 s of real silence for each silent update (BF-005), where the message
  should have been announced;
- a spoken marker for each page, e.g. "New page: Checkout".

The voice follows the page's `lang` attribute when espeak-ng has a voice for it,
otherwise English (the report notes this). espeak-ng is a free, optional system
program:

| System | Install |
|---|---|
| macOS | `brew install espeak-ng` |
| Debian / Ubuntu | `sudo apt-get install espeak-ng` |
| Fedora | `sudo dnf install espeak-ng` |
| Windows | Download the installer from the [espeak-ng releases](https://github.com/espeak-ng/espeak-ng/releases) and make sure `espeak-ng` is on the `PATH`. |

Without it, Blindfold prints `Audio skipped: espeak-ng not found…`, the report
says the same, and everything else (including the exit code) is unchanged. Use
`--no-audio` to skip audio silently.

### Mobile viewport

`--viewport mobile` tests at 390×844 with the phone layout (the page's meta
viewport applies, device scale factor 2). Touch is off: Blindfold tests
keyboard users, such as people using a Bluetooth keyboard or switch access on a
phone. Many sites hide navigation behind a menu button at this size, which is
where mobile-only keyboard barriers tend to be.

### Logged-in pages

```sh
npm run blindfold -- login https://example.com/login --save-session my-site.session.json
npm run blindfold -- scan https://example.com/account --session my-site.session.json
```

`login` opens a visible browser. Log in by hand, then close the window:
Blindfold saves the browser's cookies and local storage to the file (readable
only by you). `--session` loads it into `scan` and `run`.

**The session file contains your login. Don't commit or share it.** Name it
`*.session.json`: this repository's `.gitignore` already ignores that pattern.
Blindfold can't tell that a session has expired; if the site then shows its
login page instead, that page is what gets tested.

### iframes and new tabs

- **Same-origin iframes** (same scheme, host and port as the page) are tested
  like the page: when Tab moves focus into one, Blindfold follows it, reads the
  focused element's role and name, runs the screen reader inside it, and
  applies the normal rules. Selectors show the frame path, e.g.
  `iframe#reviews >>> button.vote` (the part after `>>>` is a CSS selector
  inside the frame; it isn't valid CSS on its own).
- **Third-party iframes** (any other origin, e.g. a payment form) are a
  boundary: the transcript records focus entering and leaving ("Focus entered a
  frame from payments.example; Blindfold doesn't test third-party content"),
  Tab presses inside still count as effort, and nothing inside is reported.
- **New tabs and windows** opened by a journey action are recorded on the
  step; with `follow_new_tab: true` the journey continues in the new tab.

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
- After a focus trap, unreached controls *before* the trap (in document order)
  are reported as BF-001, because Tab passed their position. Controls after it
  are listed as "not tested".
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
- Sessions: Blindfold can't tell that a saved login has expired.
- Audio replay: espeak-ng's voice is not a real screen reader's voice or
  wording; the text is Blindfold's transcript. Typed text makes no sound (it
  doesn't count toward effort either).

## Benchmark and development

- `demo-sites/buggy-shop`: the fictional Pebble & Pine shop with 8 planted
  accessibility bugs, plus one mobile-only bug (see `PLANTED-BUGS.md`).
- `demo-sites/accessible-shop`: the same pages, built correctly (see
  `FIXES.md`).
- `spikes/`: the Phase 0 announcer spike, kept as a historical record.
- `example-journeys/`: journeys that work against either demo shop with
  `--base-url` (the newsletter-trap one targets the buggy shop's trap, and the
  mobile-menu one sets `viewport: mobile`).

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
