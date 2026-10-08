# Announcer spike — results

**Question:** how do we turn "the element that currently has keyboard focus" into
"what a screen reader would say"?

**Answer:** use Guidepup's virtual screen reader as the primary engine and
Playwright's ARIA snapshot as the fallback and cross-check. Details below.

Run it yourself with `npm run spike:announcer`. Raw data is in
`announcer-spike-output.json`.

## Setup

- Page: buggy shop home page, `http://localhost:4000/?no-cookie-banner=1`
- Headless Chromium through Playwright 1.64, 25 real Tab key presses
- `@guidepup/virtual-screen-reader` 0.33.0 (MIT licence)
- The spike starts its own buggy-shop server on port 4000 and stops it at the
  end. If port 4000 is busy, it exits with a clear message instead of testing
  whatever is running there. Tests call the exported `runAnnouncerSpike()`
  with a server on a random free port.

## How each engine was wired up

### Engine A — Guidepup virtual screen reader

- No bundling was needed. The package already ships a self-contained browser
  build (`@guidepup/virtual-screen-reader/browser.js`, about 400 KB, no
  imports), so esbuild was not installed.
- The spike reads that file from `node_modules` and uses `page.route()` to
  serve it at a made-up path on the page's own origin
  (`/__blindfold/virtual-screen-reader.js`). A small inline module script
  (`page.addScriptTag`) imports it and calls
  `virtual.start({ container: document.body })`.
- Guidepup listens for the browser's `focusin` event, so it follows **real**
  Playwright Tab presses. We never drive it with its own `virtual.next()`
  commands, so the page's real tab order and keyboard handlers stay in charge.
  That matters for traps like BF-003.
- Before each Tab, the spike clears Guidepup's spoken-phrase log. After it,
  the spike reads everything spoken (`spokenPhraseLog()`).
- It worked on the first attempt and has been reliable on every run since.

### Engine B — Playwright accessibility data

- `page.locator(":focus").ariaSnapshot()` returns YAML such as
  `- link "Shop":` followed by child lines. We keep the first line and strip
  the `- ` and trailing `:`, giving role and accessible name (`link "Shop"`).
- This uses Chromium's own accessibility tree. Nothing is injected into the
  page.
- If focus is on `<body>`, `:focus` matches nothing, so the spike checks for
  this first and records `(focus on page body)` instead of waiting for a
  timeout.

### Focus-visible check — computed-style baseline (no fallback needed)

- **Method used: computed-style baseline.** The screenshot fallback was not
  needed.
- At page load, before any key press, the spike records the computed outline,
  box-shadow, border (all four sides), background and text-decoration of every
  focusable element. These are stored in a `WeakMap` inside the page.
- After each Tab, it reads the focused element's styles again and compares them
  with its baseline. Any change means a visible indicator. An outline with
  `none` style or zero width counts as no outline, whatever its colour.
- Nothing is blurred or re-focused during the walk, so page focus handlers
  (such as the BF-003 trap) are never triggered by the check itself.
- **Limitation:** elements added after page load have no baseline and are
  reported as `unknown`. Later phases will need either a baseline refresh after
  DOM changes or the screenshot fallback for those.
- **Limitation:** the shop has no CSS transitions on purpose. On real sites a
  focus style that animates in could be read mid-change.

## Transcript (buggy shop, first 25 Tab stops)

A ms = time inside the page from the focus event until Guidepup had spoken.
B ms = Node-to-page round trip for the ARIA snapshot.

| # | Element | Engine A (Guidepup) | Engine B (Playwright) | Focus visible | A ms | B ms |
|---|---|---|---|---|---|---|
| 1 | `a.skip-link "Skip to main content"` | link, Skip to main content | link "Skip to main content" | yes | 3.3 | 14.5 |
| 2 | `a.shop-logo "Pebble & Pine"` | link, Pebble & Pine | link "Pebble & Pine" | yes | 1.2 | 1.9 |
| 3 | `a.nav-link "Shop"` | link, Shop, current page | link "Shop" | **no** | 1.1 | 1.7 |
| 4 | `a.nav-link "Tote bag"` | link, Tote bag | link "Tote bag" | **no** | 12 | 1.9 |
| 5 | `a.nav-link "Cart"` | link, Cart | link "Cart" | **no** | 14.6 | 1.9 |
| 6 | `a.nav-link "Checkout"` | link, Checkout | link "Checkout" | **no** | 11.9 | 1.8 |
| 7 | `button.cart-button ""` | **button** | **button** | yes | 14.6 | 2.1 |
| 8 | `a "Linen tote bag"` | link, Linen tote bag | link "Linen tote bag" | yes | 12.6 | 2 |
| 9 | `input#newsletter-email ""` | textbox, Email address, required | textbox "Email address" | yes | 12.5 | 3 |
| 10 | `button.newsletter-subscribe-button "Subscribe"` | button, Subscribe | button "Subscribe" | yes | 8.5 | 2.3 |
| 11 | `input#newsletter-email ""` | textbox, Email address, required | textbox "Email address" | yes | 1 | 1.8 |
| 12 | `button.newsletter-subscribe-button "Subscribe"` | button, Subscribe | button "Subscribe" | yes | 6.6 | 2.2 |
| 13 | `input#newsletter-email ""` | textbox, Email address, required | textbox "Email address" | yes | 0.8 | 1.7 |
| 14 | `button.newsletter-subscribe-button "Subscribe"` | button, Subscribe | button "Subscribe" | yes | 7.1 | 1.8 |
| 15 | `input#newsletter-email ""` | textbox, Email address, required | textbox "Email address" | yes | 0.7 | 1.7 |
| 16 | `button.newsletter-subscribe-button "Subscribe"` | button, Subscribe | button "Subscribe" | yes | 8.2 | 1.9 |
| 17 | `input#newsletter-email ""` | textbox, Email address, required | textbox "Email address" | yes | 1.8 | 2 |
| 18 | `button.newsletter-subscribe-button "Subscribe"` | button, Subscribe | button "Subscribe" | yes | 7.4 | 1.5 |
| 19 | `input#newsletter-email ""` | textbox, Email address, required | textbox "Email address" | yes | 1.1 | 1.4 |
| 20 | `button.newsletter-subscribe-button "Subscribe"` | button, Subscribe | button "Subscribe" | yes | 8.4 | 1.2 |
| 21 | `input#newsletter-email ""` | textbox, Email address, required | textbox "Email address" | yes | 0.6 | 1.1 |
| 22 | `button.newsletter-subscribe-button "Subscribe"` | button, Subscribe | button "Subscribe" | yes | 11.2 | 1.4 |
| 23 | `input#newsletter-email ""` | textbox, Email address, required | textbox "Email address" | yes | 0.5 | 1.3 |
| 24 | `button.newsletter-subscribe-button "Subscribe"` | button, Subscribe | button "Subscribe" | yes | 11.5 | 1.5 |
| 25 | `input#newsletter-email ""` | textbox, Email address, required | textbox "Email address" | yes | 0.5 | 1.3 |

Steps 9–25 also show the planted **BF-003** trap. After Subscribe, focus
jumps back to the email field and alternates between the two for the rest of
the walk.

For comparison, the **accessible** shop gives `button, Cart, 2 items` and
`button "Cart, 2 items"` for the cart button, and `yes` for all four nav links.
After Subscribe, focus leaves the page (`body`) and wraps back to the skip
link: no trap.

## Where the engines agree and disagree

**Agree:** on all 25 stops, both engines give the same role and the same
accessible name. Both give an unnamed cart button as just "button".

**Disagree (Guidepup tells us more):**

| Situation | Engine A (Guidepup) | Engine B (Playwright) |
|---|---|---|
| Current-page nav link | `link, Shop, current page` | `link "Shop"` (no `aria-current`) |
| Required field | `textbox, Email address, required` | `textbox "Email address"` (no required state) |
| Size guide button (product page) | `button, Size guide, has popup dialog` | `button "Size guide"` |
| Opening the accessible size guide | `dialog, Size guide, modal` then `heading, Size guide, level 2` | only the newly focused heading |
| "Add to cart" in the **accessible** shop (`role="status"`) | logs `polite: Linen tote bag added to cart.` | sees that a `status` role exists, but not that anything was announced |
| "Add to cart" in the **buggy** shop (BF-005) | nothing announced: the bug is directly visible | `text: Linen tote bag added to cart.` (text present, no announcement info) |
| Focus on `<body>` | nothing announced | `(focus on page body)`, after an explicit check |

The last four rows were checked with a one-off probe on the product and cart
pages. The probe isn't committed; the brief's spike only walks the home page.

The live-region row is the most important difference. Guidepup records what a
screen reader would actually announce when content changes. That is exactly
what BF-005 (silent updates) needs, and Playwright's snapshot cannot provide it.

**Where Playwright is stronger:** its accessible names come from Chromium's
own accessibility tree, the same source real screen readers use. Guidepup
computes names itself in JavaScript (`dom-accessibility-api`), so on unusual
markup the two could differ. In this spike they never did.

## Do the planted bugs show up?

- **BF-002 (unnamed cart button): yes, in both engines.** Step 7 is announced
  as `button` by Guidepup and `button` (no name) by Playwright. In the
  accessible shop both give "Cart, 2 items".
- **BF-004 (invisible nav focus): yes.** Steps 3–6 (all four nav links) have
  no style change on focus, so they're reported as `no`. Every other stop is
  `yes`, via an outline change. In the accessible shop all four nav links are
  `yes`.

## Speed per step

| | Min | Median | Mean | Max |
|---|---|---|---|---|
| Engine A — in page, focus event → phrase spoken | 0.5 ms | 7.1 ms | 6.4 ms | 14.6 ms |
| Engine A — reading the phrase back to Node | 0.3 ms | 6.3 ms | 5.6 ms | 13.8 ms |
| Engine B — ARIA snapshot round trip | 1.1 ms | 1.8 ms | 2.3 ms | 14.5 ms |

- Both engines are far faster than anything a page needs to settle after a key
  press, so speed doesn't decide this.
- Engine A's read time includes waiting for the in-page timer to report, so it
  overlaps with the in-page time. It is not extra work.
- Guidepup handles focus asynchronously and **rebuilds its whole accessibility
  tree on every focus change**, so its cost grows with page size. Playwright
  only computes the focused subtree. This page is small; large pages are
  untested and should be measured in Phase 1.

## Recommendation

**Primary: Guidepup virtual screen reader (Engine A).**
- Its output is what a screen reader user would actually hear, including
  states (current page, required, has popup, modal, heading level) that matter
  for the report and audio replay.
- It is the only engine that records live-region announcements, which BF-005
  needs.
- It follows real keyboard focus, needs no bundling step, is free and MIT
  licensed, and worked reliably here.

**Fallback and cross-check: Playwright ARIA snapshot (Engine B).**
- Use it when Guidepup can't start on a page (for example, a strict Content
  Security Policy blocking the injected module script; Playwright's
  `bypassCSP` context option may solve that).
- Use it as a cross-check for accessible names, because it reflects Chromium's
  own accessibility tree.
- It needs nothing injected into the page.

**Risks to watch in Phase 1:**
- Guidepup is version 0.x, so its API may change. Pin the version.
- Measure Guidepup's per-step cost on a large real-world page.
- Decide how to refresh focus-style baselines for elements created after
  page load.
