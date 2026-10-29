# Proposed verdicts to confirm

Pages scanned between 2026-10-15T09:43:12.960Z and 2026-10-15T10:01:15.713Z · Blindfold 0.6.0. Built by `npm run corpus:report`.

**199 findings** in the latest run carry a verdict Claude proposed (`"proposed": true` in `corpus/triage-verdicts.json`).
They don't count in precision until you confirm them. To confirm, remove `"proposed": true` from the entries
(or change `verdict` first). Classes are described in `corpus/TRIAGE-CLASSES.md`.

## Summary

| Class | Pattern | Rules | Proposed verdict | Findings | Pages |
|---|---|---|---|---|---|
| FA-5 | Focus indicator on an ancestor more than two levels up (or its pseudo-element) | BF-004 | false-alarm | 4 | 1 |
| R-1 | Links that blur themselves on focus | BF-001 | real | 8 | 1 |
| R-2 | Controls with no accessible name | BF-002 | real | 176 | 6 |
| R-5 | Mouse-only scripted controls | BF-001 | real | 5 | 2 |
| R-6 | No visible focus at all | BF-004 | real | 5 | 2 |
| U-1 | Stripe controls with \`tabindex="-1"\` at scan time | BF-001 | unsure | 1 | 1 |

## FA-5: Focus indicator on an ancestor more than two levels up (or its pseudo-element)

- **Proposed verdict:** false-alarm · **Findings:** 4
- **Pages (1):** https://www.lemonde.fr/
- **Example:** https://www.lemonde.fr/: BF-004 [likely] `a.ds-card__link "What's in Le Pen's fiscal 'magic measur…"` (`#\31 50259 > h3 > a`)
- **Note:** New article card: focus indicator on an ancestor more than 8 px away (same pattern as FA-5).

## R-1: Links that blur themselves on focus

- **Proposed verdict:** real · **Findings:** 8
- **Pages (1):** https://www.w3.org/WAI/demos/bad/before/home.html
- **Example:** https://www.w3.org/WAI/demos/bad/before/home.html: BF-001 [likely] `a "Heat wave linked to temperatures"` (`#content > div:nth-of-type(2) > div:nth-of-type(1) > a`)
- **Note:** New after the recall fix: planted link that blurs itself on focus (WCAG F55).

## R-2: Controls with no accessible name

- **Proposed verdict:** real · **Findings:** 176
- **Pages (6):** https://www.w3.org/WAI/demos/bad/before/survey.html, https://demowebshop.tricentis.com/, https://www.tentree.com/, https://techcrunch.com/, https://stripe.com/, https://www.lemonde.fr/
- **Example:** https://www.w3.org/WAI/demos/bad/before/survey.html: BF-002 [certain] `input.align` (`#main > div > form > table:nth-of-type(1) > tbody > tr > td > table > tbody > tr > td:nth-of-type(2) > table > tbody > tr:nth-of-type(3) > td:nth-of-type(1) > table > tbody > tr:nth-of-type(1) > td:nth-of-type(1) > input`)
- **Note:** New after the fixes: control with no accessible name (same pattern as R-2).

## R-5: Mouse-only scripted controls

- **Proposed verdict:** real · **Findings:** 5
- **Pages (2):** https://demowebshop.tricentis.com/, https://www.tentree.com/
- **Example:** https://demowebshop.tricentis.com/: BF-001 [likely] `a.nivo-prevNav "Prev"` (`#nivo-slider > div:nth-of-type(2) > a:nth-of-type(1)`)
- **Note:** New after the fixes: mouse-only control (same pattern as R-5).

## R-6: No visible focus at all

- **Proposed verdict:** real · **Findings:** 5
- **Pages (2):** https://www.tentree.com/, https://www.lemonde.fr/
- **Example:** https://www.tentree.com/: BF-004 [likely] `input#subscribe_phone` (`#subscribe_phone`)
- **Note:** New after the fixes: outline removed, nothing changes on focus (same pattern as R-6).

## U-1: Stripe controls with \`tabindex="-1"\` at scan time

- **Proposed verdict:** unsure · **Findings:** 1
- **Pages (1):** https://stripe.com/
- **Example:** https://stripe.com/: BF-001 [check by hand] `a.hds-button "Guide me"` (`#navigation-menu > div:nth-of-type(1) > ul > li:nth-of-type(6) > a`)
- **Note:** New: Stripe control with tabindex=-1 (same pattern as U-1).

16 more proposed verdicts match no finding in this run (fixed, or the page wasn't scanned); they're left out.
