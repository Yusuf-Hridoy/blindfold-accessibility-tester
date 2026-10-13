# Corpus triage by class

First corpus run (2026-10-13, Blindfold 0.6.0): 100 pages, 98 scanned, **443 findings**, grouped into 25 classes.
Every finding belongs to exactly one class. My proposed verdict for every member is in `corpus/triage-verdicts.json`
with `"proposed": true` and the class id; **nothing is fixed yet**. Give one verdict per class (real / false-alarm / unsure)
and I'll write it to every member.

I checked each class on the live pages (markup, Chromium's accessibility tree, which styles change on keyboard focus, CSS transitions, Tab behaviour).

## Summary

| Class | Pattern | Rule | Findings | Pages | Proposed |
|---|---|---|---|---|---|
| FA-1 | `<summary>` has no name in Engine B | BF-002 | 63 | 62 | false-alarm |
| FA-2 | Focus inside an open shadow root attributed to its host | BF-002, BF-003 | 5 | 2 | false-alarm |
| FA-3 | Focus style applied through a CSS transition, read before it ran | BF-004 | 9 | 3 | false-alarm |
| FA-4 | Focus indicator drawn on a descendant (including SVG fill/stroke) | BF-004 | 21 | 5 | false-alarm |
| FA-5 | Focus indicator on an ancestor more than two levels up (or its pseudo-element) | BF-004 | 39 | 2 | false-alarm |
| FA-6 | Walk ended at `<body>` mid-page because a control blurs itself on focus | BF-001 | 145 | 5 | false-alarm |
| FA-7 | Mouse-only parts of a keyboard-operable widget | BF-001 | 37 | 9 | false-alarm |
| FA-8 | Arrow-key widget nested in another arrow-key widget | BF-001 | 3 | 1 | false-alarm |
| FA-9 | Clickable label of a reachable control | BF-001 | 1 | 1 | false-alarm |
| FA-10 | Modal backdrop that closes on click | BF-001 | 1 | 1 | false-alarm |
| FA-11 | Decorative image with a click listener but no pointer cursor | BF-001 | 2 | 1 | false-alarm |
| FA-12 | Focusable scroll container without a name (non-control role) | BF-002 | 5 | 3 | false-alarm |
| FA-13 | Full-viewport app canvas reported as a blocking overlay | BF-008 | 1 | 1 | false-alarm |
| R-1 | Links that blur themselves on focus | BF-001 | 24 | 5 | real |
| R-2 | Controls with no accessible name | BF-002 | 23 | 13 | real |
| R-3 | Focusable links hidden from screen readers | BF-002 | 4 | 1 | real |
| R-4 | Visible links removed from the Tab order with no reachable twin | BF-001 | 11 | 1 | real |
| R-5 | Mouse-only scripted controls | BF-001 | 4 | 3 | real |
| R-6 | No visible focus at all | BF-004 | 3 | 2 | real |
| R-7 | Link name lost because its text is inside a `<nav>` | BF-002 | 5 | 1 | real |
| R-8 | Keyboard confined to the app container focused at load | BF-001 | 26 | 1 | real |
| U-1 | Stripe controls with `tabindex="-1"` at scan time | BF-001 | 7 | 1 | unsure |
| U-2 | react.dev search inputs | BF-004 | 2 | 1 | unsure |
| U-3 | Excalidraw app container announced as an unnamed image | BF-002 | 1 | 1 | unsure |
| U-4 | Allbirds cart drawer overlay (BF-008) | BF-008 | 1 | 1 | unsure |

If you accept every proposal: 100 real, 332 false alarms, 11 unsure, so precision today would be 23%. 13 false-alarm classes would each get an offline snippet test and a general fix.

## FA-1: `<summary>` has no name in Engine B

- **Rule:** BF-002 · **Findings:** 63 · **Proposed verdict:** false-alarm
- **Pages (62):** https://www.w3.org/WAI/ARIA/apg/patterns/accordion/examples/accordion/, https://www.w3.org/WAI/ARIA/apg/patterns/alert/examples/alert/, https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/examples/alertdialog/, https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/examples/breadcrumb/, https://www.w3.org/WAI/ARIA/apg/patterns/button/examples/button/, https://www.w3.org/WAI/ARIA/apg/patterns/button/examples/button_idl/, https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/, https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-2-tablist/, and 54 more
- **Examples:**
  - https://www.w3.org/WAI/ARIA/apg/patterns/accordion/examples/accordion/: BF-002 [check-by-hand] `summary "The code in this example is not intende…"` (`#support-notice > summary`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/alert/examples/alert/: BF-002 [check-by-hand] `summary "The code in this example is not intende…"` (`#support-notice > summary`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/examples/alertdialog/: BF-002 [check-by-hand] `summary "The code in this example is not intende…"` (`#support-notice > summary`)
- **Why:** Playwright's ARIA snapshot exposes a `<summary>` with no role and no name (it shows only its text), so Engine B reports an empty name. Chromium's own accessibility tree and Guidepup both name it from its text (Guidepup reads it aloud). Every APG example page has a `<summary>` notice, which is why 62 of 69 APG pages have exactly this one finding. Confidence already says "check by hand" on APG (Guidepup spoke the name) but "likely" on MDN.
- **Proposed general fix (after your verdict):** Name `<summary>` from its text content (the browser's rule for a summary/disclosure button), instead of trusting the snapshot's empty name.

## FA-2: Focus inside an open shadow root attributed to its host

- **Rule:** BF-002, BF-003 · **Findings:** 5 · **Proposed verdict:** false-alarm
- **Pages (2):** https://www.tentree.com/, https://developer.mozilla.org/en-US/docs/Web/HTML
- **Examples:**
  - https://www.tentree.com/: BF-002 [certain] `product-info` (`#womens-skyline-vest-ashwood > div > div:nth-of-type(2) > product-info`)
  - https://www.tentree.com/: BF-003 [certain] `product-info` (`#womens-skyline-vest-ashwood > div > div:nth-of-type(2) > product-info`)
  - https://developer.mozilla.org/en-US/docs/Web/HTML: BF-002 [likely] `mdn-placement-top` (`body > div:nth-of-type(1) > mdn-placement-top`)
- **Why:** `document.activeElement` stops at the shadow host when focus is on an element inside an open shadow root. Blindfold records the host (a custom element with no role or name) as the focused element, so it reports BF-002 on the host. On tentree, Tab moved between several links inside `<product-info>`'s shadow root while the host stayed "focused", so the same id repeated and BF-003 fired too.
- **Proposed general fix (after your verdict):** Follow `activeElement` into open shadow roots (`shadowRoot.activeElement`, recursively), like frames are followed today.

## FA-3: Focus style applied through a CSS transition, read before it ran

- **Rule:** BF-004 · **Findings:** 9 · **Proposed verdict:** false-alarm
- **Pages (3):** https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/, https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/, https://www.telerik.com/support/demos
- **Examples:**
  - https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/: BF-004 [certain] `button#toggle-folk-futures "Details"` (`#toggle-folk-futures`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/: BF-004 [certain] `button#toggle-playful-dissonance "Details"` (`#toggle-playful-dissonance`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/: BF-004 [certain] `input#adults` (`#adults`)
- **Why:** The focus style is visible but animated (`transition: color/background/outline … 0.1–0.2s`). Blindfold reads computed styles right after the Tab press, while the transition is still at its start value, so nothing appears to have changed. Verified on each page: after 400 ms the colour, background or the parent's outline has changed.
- **Proposed general fix (after your verdict):** Before comparing styles, finish or wait out running CSS transitions on the checked elements (e.g. read the transition's end value, or wait for `getAnimations()` to settle, capped at ~0.5 s).

## FA-4: Focus indicator drawn on a descendant (including SVG fill/stroke)

- **Rule:** BF-004 · **Findings:** 21 · **Proposed verdict:** false-alarm
- **Pages (5):** https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/, https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-2-tablist/, https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/examples/slider-multithumb/, https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/, https://stripe.com/
- **Examples:**
  - https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/: BF-004 [certain] `button.rotation` (`#myCarousel > div > div:nth-of-type(1) > button:nth-of-type(1)`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/: BF-004 [certain] `button.previous` (`#myCarousel > div > div:nth-of-type(1) > button:nth-of-type(2)`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/: BF-004 [certain] `button.next` (`#myCarousel > div > div:nth-of-type(1) > button:nth-of-type(3)`)
- **Why:** The indicator is on a child: Stripe's bento cards and case-study cards outline an inner wrapper or fake-link; APG's carousel buttons and sliders change `fill`/`stroke` of child SVG shapes. Blindfold only compares the element, its ::before/::after, its parent and grandparent, and doesn't compare SVG `fill`/`stroke`.
- **Proposed general fix (after your verdict):** Also compare the focused element's descendants (bounded number), and add `fill` and `stroke` to the compared properties.

## FA-5: Focus indicator on an ancestor more than two levels up (or its pseudo-element)

- **Rule:** BF-004 · **Findings:** 39 · **Proposed verdict:** false-alarm
- **Pages (2):** https://www.atlassian.com/, https://www.lemonde.fr/
- **Examples:**
  - https://www.atlassian.com/: BF-004 [certain] `input#language-dropdown` (`#language-dropdown`)
  - https://www.lemonde.fr/: BF-004 [certain] `a.ds-card__link "After ban of one stun grenade, French p…"` (`#\31 52425 > h2 > a`)
- **Why:** Le Monde's article cards draw the outline on `div.ds-card__clickarea::after` three levels above the link (a full-card click area); Atlassian's react-select combobox draws a border on its control container three levels up. Blindfold stops at the grandparent.
- **Proposed general fix (after your verdict):** Also compare ancestors further up (bounded, e.g. up to 5 levels), only counting changes that apply while focus is inside them (`:focus-within`).

## FA-6: Walk ended at `<body>` mid-page because a control blurs itself on focus

- **Rule:** BF-001 · **Findings:** 145 · **Proposed verdict:** false-alarm
- **Pages (5):** https://www.w3.org/WAI/demos/bad/before/home.html, https://www.w3.org/WAI/demos/bad/before/news.html, https://www.w3.org/WAI/demos/bad/before/tickets.html, https://www.w3.org/WAI/demos/bad/before/survey.html, https://www.w3.org/WAI/demos/bad/before/template.html
- **Examples:**
  - https://www.w3.org/WAI/demos/bad/before/home.html: BF-001 [likely] `a "Copyright"` (`#page > table > tbody > tr > td > table > tbody > tr:nth-of-type(2) > td:nth-of-type(2) > `)
  - https://www.w3.org/WAI/demos/bad/before/home.html: BF-001 [likely] `a "MIT"` (`#page > table > tbody > tr > td > table > tbody > tr:nth-of-type(2) > td:nth-of-type(2) > `)
  - https://www.w3.org/WAI/demos/bad/before/home.html: BF-001 [likely] `a "ERCIM"` (`#page > table > tbody > tr > td > table > tbody > tr:nth-of-type(2) > td:nth-of-type(2) > `)
- **Why:** On the BAD "before" pages the navigation links have `onfocus="blur();"`. Tab lands on one, it drops focus, `document.activeElement` is `<body>`, and the walk (which started at the top) took that as the end of the page. In the browser the next Tab continues from that point, so all following links are reachable after a few "dead" presses. The incomplete-walk warning did fire on these pages. (The blurring links themselves are real barriers: class R-1.)
- **Proposed general fix (after your verdict):** When Tab lands on `<body>` before the walk has wrapped, press Tab again: if focus lands on an element after the last stop in document order (not back at the top), the page hasn't ended and the walk continues.

## FA-7: Mouse-only parts of a keyboard-operable widget

- **Rule:** BF-001 · **Findings:** 37 · **Proposed verdict:** false-alarm
- **Pages (9):** https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-both/, https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/, https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-none/, https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-datepicker/, https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/examples/slider-multithumb/, https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-color-viewer/, https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/, https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/, and 1 more
- **Examples:**
  - https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-both/: BF-001 [check-by-hand] `button#cb1-button` (`#cb1-button`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/: BF-001 [check-by-hand] `button#cb1-button` (`#cb1-button`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-none/: BF-001 [check-by-hand] `button#cb1-button` (`#cb1-button`)
- **Why:** APG's own patterns: a slider's rail and the rating slider's click targets, spinbutton +/- buttons and the date spinbuttons' arrows (`tabindex="-1"`), combobox and date-picker open buttons (`tabindex="-1"`). Each belongs to a widget (slider, spinbutton, combobox) the keyboard reaches and operates with arrow keys or Alt+Down, so the mouse-only part adds nothing a keyboard user lacks.
- **Proposed general fix (after your verdict):** An unreached element inside, or in the same immediate container as, a reached element with role slider, spinbutton or combobox is "not tested: mouse shortcut of a keyboard widget", not BF-001.

## FA-8: Arrow-key widget nested in another arrow-key widget

- **Rule:** BF-001 · **Findings:** 3 · **Proposed verdict:** false-alarm
- **Pages (1):** https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/
- **Examples:**
  - https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/: BF-001 [check-by-hand] `button.item "Text Align Left"` (`#ex1 > div > div:nth-of-type(2) > button:nth-of-type(1)`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/: BF-001 [check-by-hand] `button.item "Text Align Center"` (`#ex1 > div > div:nth-of-type(2) > button:nth-of-type(2)`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/: BF-001 [check-by-hand] `button.item "Text Align Right"` (`#ex1 > div > div:nth-of-type(2) > button:nth-of-type(3)`)
- **Why:** APG toolbar: the text-align radios are a `radiogroup` inside a `toolbar`. The toolbar's roving Tab stop was on another toolbar item, so no element of the radiogroup itself was a stop, and the current rule (look only at the nearest widget) didn't apply.
- **Proposed general fix (after your verdict):** Treat an item as reached by arrow keys when *any* arrow-key widget ancestor (not only the nearest) contains a focus stop.

## FA-9: Clickable label of a reachable control

- **Rule:** BF-001 · **Findings:** 1 · **Proposed verdict:** false-alarm
- **Pages (1):** https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/
- **Examples:**
  - https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/: BF-001 [certain] `div#combo1-label "Favorite Fruit"` (`#combo1-label`)
- **Why:** APG select-only combobox: the label `<div>` has a click listener that focuses the combobox. It's the combobox's `aria-labelledby` label; the combobox itself is reachable.
- **Proposed general fix (after your verdict):** An unreached element that labels a reached control (it's referenced by the control's `aria-labelledby`, or is the control's `<label>`) isn't BF-001.

## FA-10: Modal backdrop that closes on click

- **Rule:** BF-001 · **Findings:** 1 · **Proposed verdict:** false-alarm
- **Pages (1):** https://www.allbirds.com/
- **Examples:**
  - https://www.allbirds.com/: BF-001 [certain] `div.bg-opacity-90` (`#shopify-section-sections--16476870967376__geofencing > div > div > div > div:nth-of-type(`)
- **Why:** Allbirds' country dialog has a full-screen `fixed inset-0` backdrop with a click listener (click outside to close). Keyboard users close dialogs with the dialog's own controls; the backdrop isn't a control.
- **Proposed general fix (after your verdict):** An unreached click target with no text that covers (almost) the whole viewport, behind a dialog, isn't BF-001.

## FA-11: Decorative image with a click listener but no pointer cursor

- **Rule:** BF-001 · **Findings:** 2 · **Proposed verdict:** false-alarm
- **Pages (1):** https://www.usa.gov/
- **Examples:**
  - https://www.usa.gov/: BF-001 [certain] `img.usa-banner__header-flag` (`#usagov-banner > div > div:nth-of-type(1) > div > div:nth-of-type(1) > img`)
  - https://www.usa.gov/: BF-001 [certain] `img` (`#block-usagov-content > div > div:nth-of-type(6) > div > img`)
- **Why:** USA.gov: two decorative images (`alt=""`, one `aria-hidden`) carry click listeners (most likely analytics), with a normal cursor. Nothing suggests to a mouse user that they do anything.
- **Proposed general fix (after your verdict):** A decorative image (`alt=""` or aria-hidden) whose only sign of interactivity is a click listener (no pointer cursor, no role, no tabindex) isn't BF-001. To be checked against the benchmarks before adopting.

## FA-12: Focusable scroll container without a name (non-control role)

- **Rule:** BF-002 · **Findings:** 5 · **Proposed verdict:** false-alarm
- **Pages (3):** https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/, https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-2-tablist/, https://www.ikea.com/gb/en/
- **Examples:**
  - https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/: BF-002 [likely] `code#sc1 "<section id="myCarousel" class="carouse…"` (`#sc1`)
  - https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-2-tablist/: BF-002 [likely] `code#sc1 "<section id="myCarousel" class="carouse…"` (`#sc1`)
  - https://www.ikea.com/gb/en/: BF-002 [likely] `div#hnf-carousel__hnf-inpage-nav "OffersChristmas ShopStorage furnitureHo…"` (`#hnf-carousel__hnf-inpage-nav`)
- **Why:** IKEA's carousels are `role="list" tabindex="0"` scroll containers; APG's `<code>` example is made keyboard-focusable by Chrome because it scrolls. ARIA doesn't require a name for `list` or `code`, and screen readers announce the role and read the content. Confidence was already "likely".
- **Proposed general fix (after your verdict):** BF-002 only for roles that require a name (controls and named landmarks), or keep them under "likely" with a separate note. Your call.

## FA-13: Full-viewport app canvas reported as a blocking overlay

- **Rule:** BF-008 · **Findings:** 1 · **Proposed verdict:** false-alarm
- **Pages (1):** https://excalidraw.com/
- **Examples:**
  - https://excalidraw.com/: BF-008 [likely] `canvas.excalidraw__canvas "Drawing canvas"` (`#root > div > div > canvas`)
- **Why:** Excalidraw's drawing canvas covers the viewport; BF-008 treated it as an overlay whose control can't be reached. It's the app's main surface, not an overlay over content.
- **Proposed general fix (after your verdict):** Not decided yet; needs a closer look at BF-008's overlay test (probably: a canvas isn't an overlay control).

## R-1: Links that blur themselves on focus

- **Rule:** BF-001 · **Findings:** 24 · **Proposed verdict:** real
- **Pages (5):** https://www.w3.org/WAI/demos/bad/before/home.html, https://www.w3.org/WAI/demos/bad/before/news.html, https://www.w3.org/WAI/demos/bad/before/tickets.html, https://www.w3.org/WAI/demos/bad/before/survey.html, https://www.w3.org/WAI/demos/bad/before/template.html
- **Examples:**
  - https://www.w3.org/WAI/demos/bad/before/home.html: BF-001 [likely] `a` (`#home > a`)
  - https://www.w3.org/WAI/demos/bad/before/home.html: BF-001 [likely] `a` (`#news > a`)
  - https://www.w3.org/WAI/demos/bad/before/home.html: BF-001 [likely] `a` (`#tickets > a`)
- **Why:** `onfocus="blur();"` on BAD's navigation links: a keyboard user can never focus or activate them. The BAD demo plants this barrier on purpose.

## R-2: Controls with no accessible name

- **Rule:** BF-002 · **Findings:** 23 · **Proposed verdict:** real
- **Pages (13):** https://www.w3.org/WAI/demos/bad/before/home.html, https://www.w3.org/WAI/demos/bad/before/news.html, https://www.w3.org/WAI/demos/bad/before/tickets.html, https://www.w3.org/WAI/demos/bad/before/survey.html, https://www.w3.org/WAI/demos/bad/before/template.html, https://www.telerik.com/support/demos, https://www.allbirds.com/, https://www.tentree.com/, and 5 more
- **Examples:**
  - https://www.w3.org/WAI/demos/bad/before/home.html: BF-002 [check-by-hand] `select "QUICKMENU ----> Broadcasting Education …"` (`#page > table > tbody > tr > td > table > tbody > tr:nth-of-type(2) > td:nth-of-type(2) > `)
  - https://www.w3.org/WAI/demos/bad/before/news.html: BF-002 [check-by-hand] `select "QUICKMENU ----> Broadcasting Education …"` (`#page > table > tbody > tr > td > table > tbody > tr:nth-of-type(2) > td:nth-of-type(2) > `)
  - https://www.w3.org/WAI/demos/bad/before/tickets.html: BF-002 [check-by-hand] `select "QUICKMENU ----> Broadcasting Education …"` (`#page > table > tbody > tr > td > table > tbody > tr:nth-of-type(2) > td:nth-of-type(2) > `)
- **Why:** Icon-only buttons and links, empty links (`<a href=""></a>`), image links with `alt=""`, an unlabelled `<select>`, a link whose `sr-only` text isn't exposed, Wikipedia backlinks whose number isn't exposed, and nameless links in third-party ad iframes. Both engines agree there's no name (except the selects, where Guidepup reads the selected value, which isn't a label).

## R-3: Focusable links hidden from screen readers

- **Rule:** BF-002 · **Findings:** 4 · **Proposed verdict:** real
- **Pages (1):** https://www.atlassian.com/
- **Examples:**
  - https://www.atlassian.com/: BF-002 [certain] `a._4bfu1r31 "Explore Strategy Collection"` (`#strategy > div > div > div > div > div:nth-of-type(2) > a`)
  - https://www.atlassian.com/: BF-002 [certain] `a._4bfu1r31 "Explore Service Collection"` (`#service > div > div > div > div > div:nth-of-type(2) > a`)
  - https://www.atlassian.com/: BF-002 [certain] `a._4bfu1r31 "Explore Software Collection"` (`#software > div > div > div > div > div:nth-of-type(2) > a`)
- **Why:** Atlassian's "Explore … Collection" links are absent from the accessibility tree but reachable with Tab: a screen reader user lands on nothing.

## R-4: Visible links removed from the Tab order with no reachable twin

- **Rule:** BF-001 · **Findings:** 11 · **Proposed verdict:** real
- **Pages (1):** https://www.telerik.com/support/demos
- **Examples:**
  - https://www.telerik.com/support/demos: BF-001 [check-by-hand] `a.u-c-white "UI for jQuery demos"` (`#ContentPlaceholder1_C329_Col00 > div > div > a:nth-of-type(1)`)
  - https://www.telerik.com/support/demos: BF-001 [check-by-hand] `a.u-c-white "Blazor demos"` (`#ContentPlaceholder1_C329_Col01 > div > div > a`)
  - https://www.telerik.com/support/demos: BF-001 [check-by-hand] `a.u-c-white "ASP.NET Core demos"` (`#ContentPlaceholder1_C329_Col02 > div > div > a`)
- **Why:** Telerik's card links (`tabindex="-1"`). Verified earlier that no reachable link goes to the same address.

## R-5: Mouse-only scripted controls

- **Rule:** BF-001 · **Findings:** 4 · **Proposed verdict:** real
- **Pages (3):** https://docs.python.org/3/, https://react.dev/, https://www.lemonde.fr/
- **Examples:**
  - https://docs.python.org/3/: BF-001 [certain] `div#sidebarbutton "«"` (`#sidebarbutton`)
  - https://react.dev/: BF-001 [certain] `div.uwu-hidden "uwu?"` (`#__next > div:nth-of-type(3) > main > div > div > footer > div > div:nth-of-type(1) > div:`)
  - https://www.lemonde.fr/: BF-001 [likely] `a "advertising partners"` (`#js-body > div:nth-of-type(5) > div > div > div:nth-of-type(2) > p > a:nth-of-type(1)`)
- **Why:** Python docs' "«" collapse-sidebar `<div>`, react.dev's "uwu?" `<div>`, and Le Monde's consent-banner links that are `<a>` without `href` ("advertising partners", "cookie settings tool").

## R-6: No visible focus at all

- **Rule:** BF-004 · **Findings:** 3 · **Proposed verdict:** real
- **Pages (2):** https://www.telerik.com/support/demos, https://www.lemonde.fr/
- **Examples:**
  - https://www.telerik.com/support/demos: BF-004 [certain] `a.TK-Menu-Item-Link "Demos"` (`#js-tlrk-nav-drawer > ul:nth-of-type(1) > li:nth-of-type(1) > a`)
  - https://www.lemonde.fr/: BF-004 [certain] `button#ds-burger-trigger__nav "Menu"` (`#ds-burger-trigger__nav`)
- **Why:** Telerik's "Demos" menu link, Le Monde's Menu button and consent button: no style change anywhere on focus (checked self, children and 8 ancestors, after 400 ms), and no transitions.

## R-7: Link name lost because its text is inside a `<nav>`

- **Rule:** BF-002 · **Findings:** 5 · **Proposed verdict:** real
- **Pages (1):** https://www.tentree.com/
- **Examples:**
  - https://www.tentree.com/: BF-002 [check-by-hand] `a.tracking-wider "WOMENS"` (`#shopify-section-layout-header > div > div:nth-of-type(2) > div > div:nth-of-type(1) > div`)
  - https://www.tentree.com/: BF-002 [check-by-hand] `a.tracking-wider "MENS"` (`#shopify-section-layout-header > div > div:nth-of-type(2) > div > div:nth-of-type(1) > div`)
  - https://www.tentree.com/: BF-002 [check-by-hand] `a.tracking-wider "ACCESSORIES"` (`#shopify-section-layout-header > div > div:nth-of-type(2) > div > div:nth-of-type(1) > div`)
- **Why:** Tentree's top navigation links wrap their text in a `<nav>` element. Chromium's accessibility tree doesn't take a link's name from inside a landmark, so the link has no name in the browser screen readers use; only Guidepup reads the text. Invalid markup with a real effect; confidence says "check by hand".

## R-8: Keyboard confined to the app container focused at load

- **Rule:** BF-001 · **Findings:** 26 · **Proposed verdict:** real
- **Pages (1):** https://excalidraw.com/
- **Examples:**
  - https://excalidraw.com/: BF-001 [likely] `button.welcome-screen-menu-item "OpenCmd+O"` (`#root > div > div > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > button:`)
  - https://excalidraw.com/: BF-001 [likely] `button.welcome-screen-menu-item "Help?"` (`#root > div > div > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > button:`)
  - https://excalidraw.com/: BF-001 [likely] `button.welcome-screen-menu-item "Live collaboration..."` (`#root > div > div > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > button:`)
- **Why:** Excalidraw focuses its app container at load and Tab never leaves it (verified: 6 Tabs, focus stays). Toolbar buttons can't be reached with Tab. Blindfold reports BF-001 rather than a trap because a trap that includes the page's first focus stop isn't detected yet (Known limitations); the incomplete-walk warning fired.

## U-1: Stripe controls with `tabindex="-1"` at scan time

- **Rule:** BF-001 · **Findings:** 7 · **Proposed verdict:** unsure
- **Pages (1):** https://stripe.com/
- **Examples:**
  - https://stripe.com/: BF-001 [check-by-hand] `button.hds-button "Solutions"` (`#navigation-menu > div:nth-of-type(1) > ul > li:nth-of-type(2) > button`)
  - https://stripe.com/: BF-001 [check-by-hand] `button.hds-button "Developers"` (`#navigation-menu > div:nth-of-type(1) > ul > li:nth-of-type(3) > button`)
  - https://stripe.com/: BF-001 [check-by-hand] `button.hds-button "Resources"` (`#navigation-menu > div:nth-of-type(1) > ul > li:nth-of-type(4) > button`)
- **Why:** Stripe's nav buttons (Solutions, Developers, Resources) had `tabindex="-1"` during the scan but `0` when I checked later (state depends on timing/hydration). The customer-story accordion's buttons and "Read the story" links are `-1` for collapsed or already-open items. Needs a person to try with a keyboard.

## U-2: react.dev search inputs

- **Rule:** BF-004 · **Findings:** 2 · **Proposed verdict:** unsure
- **Pages (1):** https://react.dev/
- **Examples:**
  - https://react.dev/: BF-004 [likely] `input#:R1sq8q6:` (`#\:R1sq8q6\:`)
  - https://react.dev/: BF-004 [likely] `input#:R6sqaq6:` (`#\:R6sqaq6\:`)
- **Why:** No focus ring on the inputs; focusing opens a results panel further up the page. Whether that counts as a visible focus indicator is a judgement call.

## U-3: Excalidraw app container announced as an unnamed image

- **Rule:** BF-002 · **Findings:** 1 · **Proposed verdict:** unsure
- **Pages (1):** https://excalidraw.com/
- **Examples:**
  - https://excalidraw.com/: BF-002 [likely] `div.excalidraw "Your drawings are saved in your browser…"` (`#root > div > div`)
- **Why:** The focused app container is exposed as `img` with no name. Probably real, but it's tangled with the R-8 trap.

## U-4: Allbirds cart drawer overlay (BF-008)

- **Rule:** BF-008 · **Findings:** 1 · **Proposed verdict:** unsure
- **Pages (1):** https://www.allbirds.com/
- **Examples:**
  - https://www.allbirds.com/: BF-008 [likely] `div.z-takeover` (`#vue-cart-drawer-app-sections--16476871000144__cart_drawer_section_4VCgQr > div > div:nth-`)
- **Why:** Not inspected: the cart drawer was closed when I checked the page.

## Pages that couldn't be scanned

- https://demowebshop.tricentis.com/: didn't finish loading within 30 s (it loaded fine on 2026-10-13 earlier; probably slow or rate-limiting the headless browser).
- https://www.rakuten.co.jp/: stopped at the 120 s time limit (a very long page). Not a finding.
