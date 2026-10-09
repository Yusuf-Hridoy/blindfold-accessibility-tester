# Fixes — Pebble & Pine (accessible shop)

This shop has the same pages, text and look as `../buggy-shop`, with each of
its 8 planted bugs (and its mobile-only bug) fixed in the standard way. It
should produce zero findings at desktop and mobile width.

| Rule | What was done to fix it |
|---|---|
| BF-001 | The checkout control is a real `<button type="button">`, so it is in the tab order and works with Enter and Space. |
| BF-002 | The cart icon button has `aria-label="Cart"`, so it is announced with a name. (No item count: the demo never updates it, so it would become wrong.) |
| BF-003 | The newsletter box has no focus-forcing `keydown` handler. Tab moves on to the footer and the rest of the page normally. |
| BF-004 | Nav links keep the site-wide `:focus-visible` style (3px blue outline with 2px offset). Nothing removes it. |
| BF-005 | The "Added to cart" message container has `role="status"`, so the message is announced politely when it appears. |
| BF-006 | After Remove, focus moves to the Remove button of the item that took the removed item's place (or the item before it, if the last item was removed). If the cart is empty, focus moves to the "Your cart" heading (`tabindex="-1"`). A `role="status"` message also announces what was removed. |
| BF-007 | Opening the size guide makes the page behind it inert and moves focus to the modal heading. Escape and the Close button both close it, and focus returns to the "Size guide" button. |
| BF-008 | "Accept" and "Reject" are real `<button>`s, and focus starts on "Accept" when the banner appears. After a choice, focus moves to the page heading. |
| BF-001 (mobile only) | Below 700px wide, the menu toggle is a real `<button type="button">` with `aria-expanded` and `aria-controls="main-menu"`. Enter, Space and clicks open and close the menu; Escape closes it and puts focus back on the toggle. At 700px and wider the toggle is hidden and the nav is shown as before. |
