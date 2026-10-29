# Blindfold real-world corpus report

Pages scanned between 2026-10-15T09:43:12.960Z and 2026-10-15T10:01:15.713Z · Blindfold 0.6.0 · desktop, no audio, no screenshots.

Precision = real ÷ (real + false alarm), counting only verdicts the owner confirmed
(`corpus/triage-verdicts.json` entries without `"proposed": true`).

## Totals per source

| Source | Pages | Scanned | Couldn't scan | Pages with findings | Findings |
|---|---|---|---|---|---|
| APG examples (expected: 0 findings) | 69 | 69 | 0 | 0 | 0 |
| BAD demo, before (expected: findings) | 5 | 5 | 0 | 5 | 49 |
| BAD demo, after (expected: no false alarms) | 5 | 5 | 0 | 0 | 0 |
| Real sites | 21 | 19 | 2 | 13 | 236 |

## Precision per rule

| Rule | Findings | Real | False alarm | Unsure | Proposed | Untriaged | Precision |
|---|---|---|---|---|---|---|---|
| BF-001 Control can't be reached by keyboard | 62 | 39 | 2 | 7 | 14 | 0 | 95% |
| BF-002 Control has no accessible name | 207 | 31 | 0 | 0 | 176 | 0 | 100% |
| BF-003 Keyboard focus gets trapped | 1 | 0 | 0 | 1 | 0 | 0 | — |
| BF-004 Keyboard focus is not visible | 15 | 1 | 5 | 0 | 9 | 0 | 17% |
| BF-005 Update is shown but not announced | 0 | 0 | 0 | 0 | 0 | 0 | — |
| BF-006 Focus is lost after an action | 0 | 0 | 0 | 0 | 0 | 0 | — |
| BF-007 Dialog opens without moving focus into it | 0 | 0 | 0 | 0 | 0 | 0 | — |
| BF-008 Overlay blocks keyboard users | 0 | 0 | 0 | 0 | 0 | 0 | — |

## Precision per confidence level

The goal: `certain` close to 100%.

| Confidence | Findings | Real | False alarm | Unsure | Proposed | Untriaged | Precision |
|---|---|---|---|---|---|---|---|
| certain | 193 | 22 | 0 | 1 | 170 | 0 | 100% |
| likely | 59 | 27 | 5 | 0 | 27 | 0 | 84% |
| check by hand | 33 | 22 | 2 | 7 | 2 | 0 | 92% |


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

- 7 findings took an earlier verdict by description (their selector changed).
- 371 verdicts match no finding on the pages scanned in this run (fixed, or the content is gone).

`npm run corpus:report -- --tidy-verdicts` moves the carried verdicts to the new selectors and removes the stale ones.

## Pages that couldn't be scanned

| Page | Reason |
|---|---|
| https://www.ikea.com/gb/en/ | Blindfold stopped after 120 s (time limit). Raise --time-limit for very large pages. |
| https://www.rakuten.co.jp/ | Blindfold stopped after 120 s (time limit). Raise --time-limit for very large pages. |

## Changed since last run

Compared with the run of 2026-10-15T06:05:15.126Z.

- https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/examples/toolbar/: couldn't scan → scanned
- https://www.telerik.com/support/demos: 1 gone
  - gone: BF-004 a.TK-Menu-Item-Link "Demos"
- https://www.tentree.com/: 1 gone, 99 new
  - new: BF-002 a.tracking-wider "WOMENS"
  - new: BF-002 a.tracking-wider "MENS"
  - new: BF-002 a.tracking-wider "ACCESSORIES"
  - new: BF-002 a.tracking-wider "CLIMATE+"
  - new: BF-002 a.tracking-wider "IMPACT"
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
  - new: BF-002 a.color-swatch-link
  - new: BF-002 a.color-swatch-link
  - gone: BF-004 input\#subscribe\_email
- https://wordpress.org/news/: couldn't scan → scanned
- https://techcrunch.com/: couldn't scan → scanned
- https://stripe.com/: 1 new
  - new: BF-001 a.hds-button "Guide me"
- https://www.atlassian.com/: 1 gone
  - gone: BF-004 input\#language-dropdown
- https://www.ikea.com/gb/en/: scanned → couldn't scan
- https://excalidraw.com/: 1 gone
  - gone: BF-002 div.excalidraw "Your drawings are saved in your browser…"
- https://www.lemonde.fr/: 6 gone, 5 new
  - new: BF-004 a.ds-card\_\_link "Why the Trump-Putin fuel agreement bene…"
  - new: BF-004 a.ds-card\_\_link "Netanyahu hails gains as Colombia opens…"
  - new: BF-004 a.ds-card\_\_link "French high school protests: How many p…"
  - new: BF-004 a.ds-card\_\_link "A new generation of activists is leadin…"
  - new: BF-004 a.ds-card\_\_link "From farms to high schools, France is a…"
  - gone: BF-004 a.ds-card\_\_link "Jean-Marc Jancovici: 'As long as there …"
  - gone: BF-004 a.ds-card\_\_link "Brazil's Congress approves shorter work…"
  - gone: BF-004 a.ds-card\_\_link "Nvidia CEO Jensen Huang 'optimistic' on…"
  - gone: BF-004 a.ds-card\_\_link "A century after his birth, Michel Fouca…"
  - gone: BF-004 a.ds-card\_\_link "A star-studded cast offers a superficia…"
  - gone: BF-004 a.ds-card\_\_link "Tiananmen Square massacre: Le Monde rev…"
