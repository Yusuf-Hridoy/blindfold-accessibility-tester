# Blindfold real-world corpus report

Pages scanned between 2026-10-14T13:14:56.385Z and 2026-10-15T06:04:57.332Z · Blindfold 0.6.0 · desktop, no audio, no screenshots.

Precision = real ÷ (real + false alarm), counting only verdicts the owner confirmed
(`corpus/triage-verdicts.json` entries without `"proposed": true`).

## Totals per source

| Source | Pages | Scanned | Couldn't scan | Pages with findings | Findings |
|---|---|---|---|---|---|
| APG examples (expected: 0 findings) | 69 | 68 | 1 | 0 | 0 |
| BAD demo, before (expected: findings) | 5 | 5 | 0 | 5 | 49 |
| BAD demo, after (expected: no false alarms) | 5 | 5 | 0 | 0 | 0 |
| Real sites | 21 | 18 | 3 | 12 | 133 |

## Precision per rule

| Rule | Findings | Real | False alarm | Unsure | Proposed | Untriaged | Precision |
|---|---|---|---|---|---|---|---|
| BF-001 Control can't be reached by keyboard | 61 | 39 | 2 | 7 | 13 | 0 | 95% |
| BF-002 Control has no accessible name | 101 | 22 | 0 | 1 | 78 | 0 | 100% |
| BF-003 Keyboard focus gets trapped | 1 | 0 | 0 | 1 | 0 | 0 | — |
| BF-004 Keyboard focus is not visible | 19 | 2 | 4 | 0 | 13 | 0 | 33% |
| BF-005 Update is shown but not announced | 0 | 0 | 0 | 0 | 0 | 0 | — |
| BF-006 Focus is lost after an action | 0 | 0 | 0 | 0 | 0 | 0 | — |
| BF-007 Dialog opens without moving focus into it | 0 | 0 | 0 | 0 | 0 | 0 | — |
| BF-008 Overlay blocks keyboard users | 0 | 0 | 0 | 0 | 0 | 0 | — |

## Precision per confidence level

The goal: `certain` close to 100%.

| Confidence | Findings | Real | False alarm | Unsure | Proposed | Untriaged | Precision |
|---|---|---|---|---|---|---|---|
| certain | 108 | 20 | 4 | 1 | 83 | 0 | 83% |
| likely | 47 | 26 | 0 | 1 | 20 | 0 | 100% |
| check by hand | 27 | 17 | 2 | 7 | 1 | 0 | 89% |


## Recall on the BAD "before" pages

Barriers the W3C planted that Blindfold's rules cover (WCAG failures F55 script removes focus, F65 image link
without alt, F68 unlabelled field; `corpus/bad-expected-barriers.json`), and how many were found.

| Rule (failure) | Expected | Found | Recall |
|---|---|---|---|
| BF-001 (F55) | 32 | 32 | 100% |
| BF-002 (F68) | 17 | 17 | 100% |
| **All** | 49 | 49 | 100% |

## Suspected false alarms (APG examples and BAD "after" pages)

None.

## Verdict upkeep

- 6 findings took an earlier verdict by description (their selector changed).
- 367 verdicts match no finding on the pages scanned in this run (fixed, or the content is gone).

`npm run corpus:report -- --tidy-verdicts` moves the carried verdicts to the new selectors and removes the stale ones.

## Pages that couldn't be scanned

| Page | Reason |
|---|---|
| https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/ | Blindfold couldn't complete the scan. https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/ didn't finish loading within 30 seconds. Check the site is responding, or raise --page-timeout. |
| https://wordpress.org/news/ | Blindfold couldn't complete the scan. https://wordpress.org/news/ didn't finish loading within 30 seconds. Check the site is responding, or raise --page-timeout. |
| https://techcrunch.com/ | Blindfold couldn't complete the scan. https://techcrunch.com/ didn't finish loading within 30 seconds. Check the site is responding, or raise --page-timeout. |
| https://www.rakuten.co.jp/ | Blindfold stopped after 120 s (time limit). Raise --time-limit for very large pages. |

## Changed since last run

Compared with the run of 2026-10-13T11:18:07.067Z.

- https://www.w3.org/WAI/ARIA/apg/patterns/accordion/examples/accordion/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/alert/examples/alert/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/examples/alertdialog/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/examples/breadcrumb/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/button/examples/button/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/button/examples/button\_idl/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/: 5 gone
  - gone: BF-002 summary "The code in this example is not intende…"
  - gone: BF-002 code\#sc1 "&lt;section id="myCarousel" class="carouse…"
  - gone: BF-004 button.rotation
  - gone: BF-004 button.previous
  - gone: BF-004 button.next
- https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-2-tablist/: 3 gone
  - gone: BF-002 summary "The code in this example is not intende…"
  - gone: BF-002 code\#sc1 "&lt;section id="myCarousel" class="carouse…"
  - gone: BF-004 button.rotation
- https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/examples/checkbox-mixed/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/examples/checkbox/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-both/: 2 gone
  - gone: BF-001 button\#cb1-button
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/: 2 gone
  - gone: BF-001 button\#cb1-button
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-none/: 2 gone
  - gone: BF-001 button\#cb1-button
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-datepicker/: 2 gone
  - gone: BF-001 button.arrow
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/: 2 gone
  - gone: BF-001 div\#combo1-label "Favorite Fruit"
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/grid-combo/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/: 3 gone
  - gone: BF-002 summary "The code in this example is not intende…"
  - gone: BF-004 button\#toggle-folk-futures "Details"
  - gone: BF-004 button\#toggle-playful-dissonance "Details"
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-faq/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-image-description/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation-hybrid/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/feed/examples/feed/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/data-grids/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/layout-grids/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/link/examples/link/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-actions/: 1 gone
  - gone: BF-002 summary "Experimental content! Do not use except…"
- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-collapsible/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-grouped/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-rearrangeable/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-scrollable/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions-active-descendant/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-links/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-editor/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-navigation/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/meter/examples/meter/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio-activedescendant/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio-rating/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/examples/slider-multithumb/: 4 gone
  - gone: BF-001 rect
  - gone: BF-002 summary "The code in this example is not intende…"
  - gone: BF-004 g.minimum "$100"
  - gone: BF-004 g.maximum "$250"
- https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-color-viewer/: 4 gone
  - gone: BF-001 rect.rail
  - gone: BF-001 rect.rail
  - gone: BF-001 rect.rail
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/: 22 gone
  - gone: BF-001 rect.target
  - gone: BF-001 text.label "1"
  - gone: BF-001 rect.target
  - gone: BF-001 text.label "2"
  - gone: BF-001 rect.target
  - gone: BF-001 text.label "3"
  - gone: BF-001 rect.target
  - gone: BF-001 text.label "4"
  - gone: BF-001 rect.target
  - gone: BF-001 text.label "5"
  - gone: BF-001 rect.target
  - gone: BF-001 text.label "6"
  - gone: BF-001 rect.target
  - gone: BF-001 text.label "7"
  - gone: BF-001 rect.target
  - gone: BF-001 text.label "8"
  - gone: BF-001 rect.target
  - gone: BF-001 text.label "9"
  - gone: BF-001 rect.target
  - gone: BF-001 text.label "10"
- https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-seek/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-temperature/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/: 7 gone
  - gone: BF-001 button.decrease
  - gone: BF-001 button.increase
  - gone: BF-001 button.decrease
  - gone: BF-001 button.increase
  - gone: BF-001 button.decrease
  - gone: BF-001 button.increase
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/: 7 gone
  - gone: BF-001 button "+"
  - gone: BF-001 button "+"
  - gone: BF-001 button "+"
  - gone: BF-002 summary "The code in this example is not intende…"
  - gone: BF-004 input\#adults
  - gone: BF-004 input\#kids
  - gone: BF-004 input\#animals
- https://www.w3.org/WAI/ARIA/apg/patterns/switch/examples/switch-button/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/switch/examples/switch-checkbox/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/switch/examples/switch/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/table/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-actions/: 1 gone
  - gone: BF-002 summary "Experimental content! Do not use except…"
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-automatic/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-manual/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/: scanned → couldn't scan
- https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/examples/treegrid-1/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-1a/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-1b/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-navigation/: 1 gone
  - gone: BF-002 summary "The code in this example is not intende…"
- https://www.w3.org/WAI/demos/bad/before/home.html: 26 gone, 8 new
  - new: BF-001 a "Heat wave linked to temperatures"
  - new: BF-001 a "Man Gets Nine Months in Violin Case"
  - new: BF-001 a "Lack of brains hinders research"
  - new: BF-001 a
  - new: BF-001 a
  - new: BF-001 a
  - new: BF-001 a "Read More..."
  - new: BF-001 a "Read More..."
  - gone: BF-001 a "Copyright"
  - gone: BF-001 a "MIT"
  - gone: BF-001 a "ERCIM"
  - gone: BF-001 a "Keio"
  - gone: BF-001 a "changelog"
  - gone: BF-001 a "Shadi Abou-Zahra"
  - gone: BF-001 a "Education and Outreach Working Group (E…"
  - gone: BF-001 a "WAI-TIES"
  - gone: BF-001 a "WAI-AGE"
  - gone: BF-001 a "Acknowledgements"
  - gone: BF-001 a "WAI Site Map"
  - gone: BF-001 a "Help with WAI Website"
  - gone: BF-001 a "Search"
  - gone: BF-001 a "Contacting WAI"
  - gone: BF-001 a "wai-eo-editors@w3.org"
  - gone: BF-001 a "wai@w3.org"
  - gone: BF-001 a "Copyright"
  - gone: BF-001 a "MIT"
  - gone: BF-001 a "ERCIM"
  - gone: BF-001 a "Keio"
- https://www.w3.org/WAI/demos/bad/before/news.html: 28 gone
  - gone: BF-001 a "trombone forgery debacle"
  - gone: BF-001 a "the way that air conditioning works"
  - gone: BF-001 a "Copyright"
  - gone: BF-001 a "MIT"
  - gone: BF-001 a "ERCIM"
  - gone: BF-001 a "Keio"
  - gone: BF-001 a "changelog"
  - gone: BF-001 a "Shadi Abou-Zahra"
  - gone: BF-001 a "Education and Outreach Working Group (E…"
  - gone: BF-001 a "WAI-TIES"
  - gone: BF-001 a "WAI-AGE"
  - gone: BF-001 a "Acknowledgements"
  - gone: BF-001 a "WAI Site Map"
  - gone: BF-001 a "Help with WAI Website"
  - gone: BF-001 a "Search"
  - gone: BF-001 a "Contacting WAI"
  - gone: BF-001 a "wai-eo-editors@w3.org"
  - gone: BF-001 a "wai@w3.org"
  - gone: BF-001 a "Copyright"
  - gone: BF-001 a "MIT"
- https://www.w3.org/WAI/demos/bad/before/tickets.html: 26 gone
  - gone: BF-001 a "Copyright"
  - gone: BF-001 a "MIT"
  - gone: BF-001 a "ERCIM"
  - gone: BF-001 a "Keio"
  - gone: BF-001 a "changelog"
  - gone: BF-001 a "Shadi Abou-Zahra"
  - gone: BF-001 a "Education and Outreach Working Group (E…"
  - gone: BF-001 a "WAI-TIES"
  - gone: BF-001 a "WAI-AGE"
  - gone: BF-001 a "Acknowledgements"
  - gone: BF-001 a "WAI Site Map"
  - gone: BF-001 a "Help with WAI Website"
  - gone: BF-001 a "Search"
  - gone: BF-001 a "Contacting WAI"
  - gone: BF-001 a "wai-eo-editors@w3.org"
  - gone: BF-001 a "wai@w3.org"
  - gone: BF-001 a "Copyright"
  - gone: BF-001 a "MIT"
  - gone: BF-001 a "ERCIM"
  - gone: BF-001 a "Keio"
- https://www.w3.org/WAI/demos/bad/before/survey.html: 39 gone, 12 new
  - new: BF-002 input.align
  - new: BF-002 select "select a city -----&gt; Afghanistan, Kabul…"
  - new: BF-002 input
  - new: BF-002 input\#em
  - new: BF-002 input\#n
  - new: BF-002 input\#ev
  - new: BF-002 input.align
  - new: BF-002 input.align
  - new: BF-002 input.align
  - new: BF-002 input.align
  - new: BF-002 input.align
  - new: BF-002 input
  - gone: BF-001 input.align
  - gone: BF-001 input.align
  - gone: BF-001 input.align
  - gone: BF-001 input.align
  - gone: BF-001 input.align
  - gone: BF-001 input.align
  - gone: BF-001 select "select a city -----&gt; Afghanistan, Kabul…"
  - gone: BF-001 input
  - gone: BF-001 input
  - gone: BF-001 input\#em
  - gone: BF-001 input\#n
  - gone: BF-001 input\#ev
  - gone: BF-001 input\#submit
  - gone: BF-001 a "Copyright"
  - gone: BF-001 a "MIT"
  - gone: BF-001 a "ERCIM"
  - gone: BF-001 a "Keio"
  - gone: BF-001 a "changelog"
  - gone: BF-001 a "Shadi Abou-Zahra"
  - gone: BF-001 a "Education and Outreach Working Group (E…"
- https://www.w3.org/WAI/demos/bad/before/template.html: 26 gone
  - gone: BF-001 a "Copyright"
  - gone: BF-001 a "MIT"
  - gone: BF-001 a "ERCIM"
  - gone: BF-001 a "Keio"
  - gone: BF-001 a "changelog"
  - gone: BF-001 a "Shadi Abou-Zahra"
  - gone: BF-001 a "Education and Outreach Working Group (E…"
  - gone: BF-001 a "WAI-TIES"
  - gone: BF-001 a "WAI-AGE"
  - gone: BF-001 a "Acknowledgements"
  - gone: BF-001 a "WAI Site Map"
  - gone: BF-001 a "Help with WAI Website"
  - gone: BF-001 a "Search"
  - gone: BF-001 a "Contacting WAI"
  - gone: BF-001 a "wai-eo-editors@w3.org"
  - gone: BF-001 a "wai@w3.org"
  - gone: BF-001 a "Copyright"
  - gone: BF-001 a "MIT"
  - gone: BF-001 a "ERCIM"
  - gone: BF-001 a "Keio"
- https://demowebshop.tricentis.com/: couldn't scan → scanned
- https://www.telerik.com/support/demos: 4 gone
  - gone: BF-004 a\#js-tlrk-skip-link "skip navigation"
  - gone: BF-004 a.TK-TLRK-Logo
  - gone: BF-004 a.TK-Button "Get A Free Trial"
  - gone: BF-004 a.Btn "See Plans &amp; Pricing"
- https://www.allbirds.com/: 2 gone
  - gone: BF-001 div.bg-opacity-90
  - gone: BF-008 div.z-takeover
- https://www.tentree.com/: 7 gone, 65 new
  - new: BF-001 div.absolute
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a
  - new: BF-002 a
  - new: BF-002 a
  - new: BF-002 a
  - new: BF-002 a
  - new: BF-002 a
  - gone: BF-002 a.tracking-wider "WOMENS"
  - gone: BF-002 a.tracking-wider "MENS"
  - gone: BF-002 a.tracking-wider "ACCESSORIES"
  - gone: BF-002 a.tracking-wider "CLIMATE+"
  - gone: BF-002 a.tracking-wider "IMPACT"
  - gone: BF-002 product-info
  - gone: BF-003 product-info
- https://wordpress.org/news/: scanned → couldn't scan
- https://techcrunch.com/: scanned → couldn't scan
- https://stripe.com/: 14 gone
  - gone: BF-004 button.modular-solutions-bento-card "Accept and optimize payments globally—o…"
  - gone: BF-004 button.modular-solutions-bento-card "Enable any billing modelPro PlanBilled …"
  - gone: BF-004 button.modular-solutions-bento-card "Monetize through agentic commerceI’m re…"
  - gone: BF-004 button.modular-solutions-bento-card "Create a card issuing program"
  - gone: BF-004 button.modular-solutions-bento-card "Access borderless money movement with s…"
  - gone: BF-004 button.modular-solutions-bento-card "Embed payments in your platformJackson …"
  - gone: BF-004 a.case-study-card "Lovable grows into a vibe-coding jugger…"
  - gone: BF-004 a.case-study-card "Gamma expands to $100M ARR and 70 milli…"
  - gone: BF-004 a.case-study-card "Runway protects developer time with no-…"
  - gone: BF-004 a.case-study-card "Supabase delivers its backend-as-a-serv…"
  - gone: BF-004 a.case-study-card "Linear partners with Stripe to handle b…"
  - gone: BF-004 a.case-study-card "ElevenLabs grows into a $3B AI audio le…"
  - gone: BF-004 a.case-study-card "Browserbase offers usage-based billing …"
  - gone: BF-004 a.case-study-card "Decagon decreases support costs by 65% …"
- https://developer.mozilla.org/en-US/docs/Web/HTML: 5 gone
  - gone: BF-002 mdn-placement-top
  - gone: BF-002 mdn-content-feedback
  - gone: BF-002 mdn-sidebar-filter
  - gone: BF-002 summary "Attributes by element"
  - gone: BF-002 summary "Attribute values"
- https://www.ikea.com/gb/en/: 3 gone
  - gone: BF-002 div\#hnf-carousel\_\_hnf-inpage-nav "OffersChristmas ShopStorage furnitureHo…"
  - gone: BF-002 div\#listing-carousel\_\_product-carousel-c64bda "New lower priceKALLAX Shelving unit, wh…"
  - gone: BF-002 div\#listing-carousel\_\_product-rec-carousel-d02a3 "NewSTRANDMON Wing chair, Talliden beige…"
- https://excalidraw.com/: 27 gone, 1 new
  - new: BF-003 div.excalidraw "Your drawings are saved in your browser…"
  - gone: BF-001 button.welcome-screen-menu-item "OpenCmd+O"
  - gone: BF-001 button.welcome-screen-menu-item "Help?"
  - gone: BF-001 button.welcome-screen-menu-item "Live collaboration..."
  - gone: BF-001 a.welcome-screen-menu-item "Sign up"
  - gone: BF-001 button\#radix-:r2:
  - gone: BF-001 button.ToolIcon
  - gone: BF-001 button.ToolIcon
  - gone: BF-001 button.ToolIcon "V"
  - gone: BF-001 button.ToolIcon "R"
  - gone: BF-001 button.ToolIcon "D"
  - gone: BF-001 button.ToolIcon "O"
  - gone: BF-001 button.ToolIcon "A"
  - gone: BF-001 button.ToolIcon "L"
  - gone: BF-001 button.ToolIcon "P"
  - gone: BF-001 button.ToolIcon "T"
  - gone: BF-001 button.ToolIcon "N"
  - gone: BF-001 button.ToolIcon "E"
  - gone: BF-001 button\#radix-:r0:
  - gone: BF-001 a.plus-banner "Try Excalidraw+14-day free trial"
  - gone: BF-001 button.excalidraw-button
- https://react.dev/: 2 gone
  - gone: BF-004 input\#:R1sq8q6:
  - gone: BF-004 input\#:R6sqaq6:
- https://www.lemonde.fr/: 36 gone, 12 new
  - new: BF-002 button.ds-btn "Previous image"
  - new: BF-004 a.ds-card\_\_link "What's in Le Pen's fiscal 'magic measur…"
  - new: BF-004 a.ds-card\_\_link "Jean-Marc Jancovici: 'As long as there …"
  - new: BF-004 a.ds-card\_\_link "Brazil's Congress approves shorter work…"
  - new: BF-004 a.ds-card\_\_link "'We want to propel the high school move…"
  - new: BF-004 a.ds-card\_\_link "Nvidia CEO Jensen Huang 'optimistic' on…"
  - new: BF-004 button.ds-btn "Previous image"
  - new: BF-004 button.ds-btn "Next image"
  - new: BF-004 button\#153159 "See more"
  - new: BF-004 button\#153159 "See more"
  - new: BF-004 a.ds-card\_\_link "A century after his birth, Michel Fouca…"
  - new: BF-004 a.ds-card\_\_link "A star-studded cast offers a superficia…"
  - gone: BF-004 button\#ds-burger-trigger\_\_nav "Menu"
  - gone: BF-004 a.ds-card\_\_link "After ban of one stun grenade, French p…"
  - gone: BF-004 a.ds-card\_\_link "What actions are French police allowed …"
  - gone: BF-004 a.ds-card\_\_link "French high school protests: What we kn…"
  - gone: BF-004 a.ds-card\_\_link "Greta Thunberg joins French students am…"
  - gone: BF-004 a.ds-card\_\_link "Trump's plan to import Russian diesel a…"
  - gone: BF-004 a.ds-card\_\_link "Why the Trump-Putin fuel agreement bene…"
  - gone: BF-004 a.ds-card\_\_link "NATO's top commander says 'alliance is …"
  - gone: BF-004 a.ds-card\_\_link "Ukraine and Europe seek to keep pressur…"
  - gone: BF-004 a.ds-card\_\_link "French navy boards Russian 'shadow flee…"
  - gone: BF-004 a.ds-card\_\_link "A disastrous day for French supermarket…"
  - gone: BF-004 a.ds-card\_\_link "Oxfam sues French state over tax inequa…"
  - gone: BF-004 a.ds-card\_\_link "French middle schooler opens fire on pr…"
  - gone: BF-004 a.ds-card\_\_link "Why Ceuta and Melilla remain a point of…"
  - gone: BF-004 a.ds-card\_\_link "Local authorities authorize killing of …"
  - gone: BF-004 a.ds-card\_\_link "UK PM Burnham levels sweeping accusatio…"
  - gone: BF-004 a.ds-card\_\_link "Hungary removes anti-LGBTQ provisions f…"
  - gone: BF-004 a.ds-card\_\_link "Cairo residents outraged over felling o…"
  - gone: BF-004 a.ds-card\_\_link "Economics Nobel Prize awarded to Americ…"
  - gone: BF-004 a.ds-card\_\_link "911 calls reveal emergency help for Chr…"
