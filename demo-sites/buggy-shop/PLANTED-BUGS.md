# Planted bugs — Pebble & Pine (buggy shop)

This shop contains exactly 8 accessibility bugs, one per Blindfold rule. Each is
the only problem of its kind on the site, so detection can be measured exactly.
Everything else is built correctly. The fixed versions live in
`../accessible-shop` (see `FIXES.md` there).

| Rule | Page | Element | How the bug is built | WCAG |
|---|---|---|---|---|
| BF-001 | `cart.html` | Checkout control (`div.checkout-button`) | A `<div>` with a click handler in `shop-behaviour.js` and no `tabindex` or role. A mouse can click it; Tab skips it. | 2.1.1 Keyboard |
| BF-002 | All pages (header) | Cart icon button (`button.cart-button`) | The button contains only an `aria-hidden` SVG and has no `aria-label` or text, so its accessible name is empty: announced as just "button". | 4.1.2 Name, Role, Value |
| BF-003 | `index.html` | Newsletter box (`section.newsletter-box`) | A `keydown` handler cancels Tab when it would leave the box (Tab on Subscribe, Shift+Tab on the email field) and calls `emailInput.focus()`. Focus can never escape. | 2.1.2 No Keyboard Trap |
| BF-004 | All pages (main nav) | Nav links (`a.nav-link`) | `shop-styles.css` sets `.main-nav .nav-link:focus { outline: none; }`, overriding the site-wide `:focus-visible` outline, with no replacement style. | 2.4.7 Focus Visible |
| BF-005 | `product-linen-tote-bag.html` | "Added to cart" message (`div.cart-message`) | The message is written into a plain `<div>` with no live-region role, so screen readers never announce it. | 4.1.3 Status Messages |
| BF-006 | `cart.html` | Remove buttons (`button.remove-button`) | Remove re-renders the cart list with `replaceChildren`, destroying the focused button. Focus is not moved, so it falls back to `<body>`. | 2.4.3 Focus Order |
| BF-007 | `product-linen-tote-bag.html` | Size guide modal (`div.size-guide-modal`) | "Size guide" only un-hides the modal. Focus stays on the trigger behind it, the page behind is not made inert, Escape does nothing, and closing does not return focus. | 2.4.3 Focus Order |
| BF-008 | `index.html` (first visit) | Cookie banner (`div.cookie-banner`) | The banner covers the page and sets `inert` on everything behind it. Its "Accept" and "Reject" controls are `<span>`s with a click handler, so a keyboard user can never dismiss it. | 2.1.1 Keyboard |

## Notes

- The cookie banner only appears on `index.html`. A choice is remembered for
  the browser session (`sessionStorage`). Add `?no-cookie-banner=1` to skip it.
- Every page also has a correctly built skip link, headings, labelled form
  fields, image descriptions and `lang="en"`. These are not bugs.
- In the source, each bug has a comment starting `Planted bug BF-00x`, except
  for the HTML-only bugs (BF-001, BF-002, BF-005, BF-008), which are the
  markup differences listed above.
