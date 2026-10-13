# Blindfold real-world corpus report

Run: 2026-10-13T11:18:07.067Z · Blindfold 0.6.0 · desktop, no audio, no screenshots.

Precision = real ÷ (real + false alarm), counting only verdicts the owner confirmed
(`corpus/triage-verdicts.json` entries without `"proposed": true`).

## Totals per source

| Source | Pages | Scanned | Couldn't scan | Pages with findings | Findings |
|---|---|---|---|---|---|
| APG examples (expected: 0 findings) | 69 | 69 | 0 | 61 | 116 |
| BAD demo, before (expected: findings) | 5 | 5 | 0 | 5 | 174 |
| BAD demo, after (expected: no false alarms) | 5 | 5 | 0 | 0 | 0 |
| Real sites | 21 | 19 | 2 | 14 | 153 |

## Precision per rule

| Rule | Findings | Real | False alarm | Unsure | Proposed | Untriaged | Precision |
|---|---|---|---|---|---|---|---|
| BF-001 Control can't be reached by keyboard | 261 | 39 | 189 | 33 | 0 | 0 | 17% |
| BF-002 Control has no accessible name | 105 | 32 | 72 | 1 | 0 | 0 | 31% |
| BF-003 Keyboard focus gets trapped | 1 | 0 | 1 | 0 | 0 | 0 | 0% |
| BF-004 Keyboard focus is not visible | 74 | 3 | 69 | 2 | 0 | 0 | 4% |
| BF-005 Update is shown but not announced | 0 | 0 | 0 | 0 | 0 | 0 | — |
| BF-006 Focus is lost after an action | 0 | 0 | 0 | 0 | 0 | 0 | — |
| BF-007 Dialog opens without moving focus into it | 0 | 0 | 0 | 0 | 0 | 0 | — |
| BF-008 Overlay blocks keyboard users | 2 | 0 | 1 | 1 | 0 | 0 | 0% |

## Precision per confidence level

The goal: `certain` close to 100%.

| Confidence | Findings | Real | False alarm | Unsure | Proposed | Untriaged | Precision |
|---|---|---|---|---|---|---|---|
| certain | 125 | 26 | 99 | 0 | 0 | 0 | 21% |
| likely | 214 | 26 | 158 | 30 | 0 | 0 | 14% |
| check by hand | 104 | 22 | 75 | 7 | 0 | 0 | 23% |

## Suspected false alarms (APG examples and BAD "after" pages)

| Page | Rule | Element | Selector | Confidence | Verdict |
|---|---|---|---|---|---|
| https://www.w3.org/WAI/ARIA/apg/patterns/accordion/examples/accordion/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/alert/examples/alert/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/examples/alertdialog/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/examples/breadcrumb/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/button/examples/button/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/button/examples/button\_idl/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/ | BF-002 | code\#sc1 "&lt;section id="myCarousel" class="carouse…" | \#sc1 | likely | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/ | BF-004 | button.rotation | \#myCarousel &gt; div &gt; div:nth-of-type(1) &gt; button:nth-of-type(1) | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/ | BF-004 | button.previous | \#myCarousel &gt; div &gt; div:nth-of-type(1) &gt; button:nth-of-type(2) | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/ | BF-004 | button.next | \#myCarousel &gt; div &gt; div:nth-of-type(1) &gt; button:nth-of-type(3) | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-2-tablist/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-2-tablist/ | BF-002 | code\#sc1 "&lt;section id="myCarousel" class="carouse…" | \#sc1 | likely | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-2-tablist/ | BF-004 | button.rotation | \#myCarousel &gt; div &gt; div:nth-of-type(1) &gt; button | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/examples/checkbox-mixed/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/examples/checkbox/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-both/ | BF-001 | button\#cb1-button | \#cb1-button | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-both/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/ | BF-001 | button\#cb1-button | \#cb1-button | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-none/ | BF-001 | button\#cb1-button | \#cb1-button | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-none/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-datepicker/ | BF-001 | button.arrow | \#myDatepicker &gt; div:nth-of-type(2) &gt; button | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-datepicker/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/ | BF-001 | div\#combo1-label "Favorite Fruit" | \#combo1-label | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/grid-combo/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/ | BF-004 | button\#toggle-folk-futures "Details" | \#toggle-folk-futures | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/ | BF-004 | button\#toggle-playful-dissonance "Details" | \#toggle-playful-dissonance | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-faq/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-image-description/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation-hybrid/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/feed/examples/feed/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/data-grids/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/layout-grids/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/link/examples/link/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-actions/ | BF-002 | summary "Experimental content! Do not use except…" | \#support-notice &gt; summary | likely | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-collapsible/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-grouped/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-rearrangeable/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-scrollable/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions-active-descendant/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-links/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-editor/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-navigation/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/meter/examples/meter/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio-activedescendant/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio-rating/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/examples/slider-multithumb/ | BF-001 | rect | \#ex1 &gt; div &gt; svg &gt; g:nth-of-type(1) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/examples/slider-multithumb/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/examples/slider-multithumb/ | BF-004 | g.minimum "$100" | \#ex1 &gt; div &gt; svg &gt; g:nth-of-type(3) | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/examples/slider-multithumb/ | BF-004 | g.maximum "$250" | \#ex1 &gt; div &gt; svg &gt; g:nth-of-type(4) | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-color-viewer/ | BF-001 | rect.rail | \#ex1 &gt; div &gt; div:nth-of-type(2) &gt; svg &gt; rect:nth-of-type(1) | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-color-viewer/ | BF-001 | rect.rail | \#ex1 &gt; div &gt; div:nth-of-type(4) &gt; svg &gt; rect:nth-of-type(1) | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-color-viewer/ | BF-001 | rect.rail | \#ex1 &gt; div &gt; div:nth-of-type(6) &gt; svg &gt; rect:nth-of-type(1) | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-color-viewer/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | rect.target | \#id-rating &gt; svg &gt; g:nth-of-type(1) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | text.label "1" | \#id-rating &gt; svg &gt; g:nth-of-type(1) &gt; text:nth-of-type(1) | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | rect.target | \#id-rating &gt; svg &gt; g:nth-of-type(2) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | text.label "2" | \#id-rating &gt; svg &gt; g:nth-of-type(2) &gt; text | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | rect.target | \#id-rating &gt; svg &gt; g:nth-of-type(3) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | text.label "3" | \#id-rating &gt; svg &gt; g:nth-of-type(3) &gt; text | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | rect.target | \#id-rating &gt; svg &gt; g:nth-of-type(4) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | text.label "4" | \#id-rating &gt; svg &gt; g:nth-of-type(4) &gt; text | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | rect.target | \#id-rating &gt; svg &gt; g:nth-of-type(5) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | text.label "5" | \#id-rating &gt; svg &gt; g:nth-of-type(5) &gt; text | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | rect.target | \#id-rating &gt; svg &gt; g:nth-of-type(6) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | text.label "6" | \#id-rating &gt; svg &gt; g:nth-of-type(6) &gt; text | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | rect.target | \#id-rating &gt; svg &gt; g:nth-of-type(7) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | text.label "7" | \#id-rating &gt; svg &gt; g:nth-of-type(7) &gt; text | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | rect.target | \#id-rating &gt; svg &gt; g:nth-of-type(8) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | text.label "8" | \#id-rating &gt; svg &gt; g:nth-of-type(8) &gt; text | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | rect.target | \#id-rating &gt; svg &gt; g:nth-of-type(9) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | text.label "9" | \#id-rating &gt; svg &gt; g:nth-of-type(9) &gt; text | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | rect.target | \#id-rating &gt; svg &gt; g:nth-of-type(10) &gt; rect | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-001 | text.label "10" | \#id-rating &gt; svg &gt; g:nth-of-type(10) &gt; text:nth-of-type(1) | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/ | BF-004 | div\#id-rating "1 Extremely Unsatisfied 2 3 4 5 6 7 8 9…" | \#id-rating | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-seek/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-temperature/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/ | BF-001 | button.decrease | \#example-group &gt; div:nth-of-type(3) &gt; button:nth-of-type(1) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/ | BF-001 | button.increase | \#example-group &gt; div:nth-of-type(3) &gt; button:nth-of-type(2) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/ | BF-001 | button.decrease | \#example-group &gt; div:nth-of-type(4) &gt; button:nth-of-type(1) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/ | BF-001 | button.increase | \#example-group &gt; div:nth-of-type(4) &gt; button:nth-of-type(2) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/ | BF-001 | button.decrease | \#example-group &gt; div:nth-of-type(5) &gt; button:nth-of-type(1) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/ | BF-001 | button.increase | \#example-group &gt; div:nth-of-type(5) &gt; button:nth-of-type(2) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/ | BF-001 | button "+" | \#example &gt; div &gt; fieldset &gt; div &gt; div:nth-of-type(1) &gt; div &gt; button:nth-of-type(2) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/ | BF-001 | button "+" | \#example &gt; div &gt; fieldset &gt; div &gt; div:nth-of-type(2) &gt; div &gt; button:nth-of-type(2) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/ | BF-001 | button "+" | \#example &gt; div &gt; fieldset &gt; div &gt; div:nth-of-type(3) &gt; div &gt; button:nth-of-type(2) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/ | BF-004 | input\#adults | \#adults | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/ | BF-004 | input\#kids | \#kids | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/ | BF-004 | input\#animals | \#animals | certain | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/switch/examples/switch-button/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/switch/examples/switch-checkbox/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/switch/examples/switch/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/table/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-actions/ | BF-002 | summary "Experimental content! Do not use except…" | \#support-notice &gt; summary | likely | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-automatic/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-manual/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/ | BF-001 | button.item "Text Align Left" | \#ex1 &gt; div &gt; div:nth-of-type(2) &gt; button:nth-of-type(1) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/ | BF-001 | button.item "Text Align Center" | \#ex1 &gt; div &gt; div:nth-of-type(2) &gt; button:nth-of-type(2) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/ | BF-001 | button.item "Text Align Right" | \#ex1 &gt; div &gt; div:nth-of-type(2) &gt; button:nth-of-type(3) | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/examples/treegrid-1/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-1a/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-1b/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |
| https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-navigation/ | BF-002 | summary "The code in this example is not intende…" | \#support-notice &gt; summary | check by hand | false-alarm |

## Pages that couldn't be scanned

| Page | Reason |
|---|---|
| https://demowebshop.tricentis.com/ | Blindfold couldn't complete the scan. https://demowebshop.tricentis.com/ didn't finish loading within 30 seconds. Check the site is responding, or raise --page-timeout. |
| https://www.rakuten.co.jp/ | Blindfold stopped after 120 s (time limit). Raise --time-limit for very large pages. |

## Changed since last run

Compared with the run of 2026-10-13T11:02:53.745Z.

- https://www.w3.org/WAI/ARIA/apg/patterns/accordion/examples/accordion/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/alert/examples/alert/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/examples/alertdialog/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/examples/breadcrumb/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/button/examples/button/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/button/examples/button\_idl/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-2-tablist/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/examples/checkbox-mixed/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/examples/checkbox/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-both/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-none/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-datepicker/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/grid-combo/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-faq/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-image-description/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation-hybrid/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/feed/examples/feed/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/data-grids/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/layout-grids/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/banner.html: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/complementary.html: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/contentinfo.html: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/form.html: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/main.html: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/navigation.html: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/region.html: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/search.html: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/link/examples/link/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-actions/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-collapsible/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-grouped/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-rearrangeable/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-scrollable/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions-active-descendant/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-links/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-editor/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-navigation/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/meter/examples/meter/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio-activedescendant/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio-rating/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/examples/slider-multithumb/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-color-viewer/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-seek/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-temperature/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/quantity-spinbutton/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/switch/examples/switch-button/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/switch/examples/switch-checkbox/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/switch/examples/switch/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/table/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-actions/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-automatic/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-manual/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/examples/treegrid-1/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-1a/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-1b/: new in the corpus
- https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-navigation/: new in the corpus
- https://demowebshop.tricentis.com/: new in the corpus
- https://www.telerik.com/support/demos: new in the corpus
- https://github.com/: new in the corpus
- https://www.allbirds.com/: new in the corpus
- https://www.tentree.com/: new in the corpus
- https://wordpress.org/news/: new in the corpus
- https://techcrunch.com/: new in the corpus
- https://www.bbc.com/news: new in the corpus
- https://www.gov.uk/: new in the corpus
- https://www.usa.gov/: new in the corpus
- https://stripe.com/: new in the corpus
- https://www.atlassian.com/: new in the corpus
- https://developer.mozilla.org/en-US/docs/Web/HTML: new in the corpus
- https://docs.python.org/3/: new in the corpus
- https://www.ikea.com/gb/en/: new in the corpus
- https://www.samsung.com/uk/: new in the corpus
- https://excalidraw.com/: new in the corpus
- https://react.dev/: new in the corpus
- https://www.lemonde.fr/: new in the corpus
- https://www.rakuten.co.jp/: new in the corpus
- https://en.wikipedia.org/wiki/Web\_accessibility: new in the corpus
