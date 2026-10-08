# Fixes — Pebble & Pine (accessible shop)

This shop has the same pages, text and look as `../buggy-shop`, with each of
its 8 planted bugs fixed in the standard way. It should produce zero findings.

| Rule | What was done to fix it |
|---|---|
| BF-001 | The checkout control is a real `<button type="button">`, so it is in the tab order and works with Enter and Space. |
| BF-002 | The cart icon button has `aria-label="Cart, 2 items"`, so it is announced with a name. |
| BF-003 | The newsletter box has no focus-forcing `keydown` handler. Tab moves on to the footer and the rest of the page normally. |
| BF-004 | Nav links keep the site-wide `:focus-visible` style (3px blue outline with 2px offset). Nothing removes it. |
| BF-005 | The "Added to cart" message container has `role="status"`, so the message is announced politely when it appears. |
| BF-006 | After Remove, focus moves to the Remove button of the item that took the removed item's place (or the item before it, if the last item was removed). If the cart is empty, focus moves to the "Your cart" heading (`tabindex="-1"`). A `role="status"` message also announces what was removed. |
| BF-007 | Opening the size guide makes the page behind it inert and moves focus to the modal heading. Escape and the Close button both close it, and focus returns to the "Size guide" button. |
| BF-008 | "Accept" and "Reject" are real `<button>`s, and focus starts on "Accept" when the banner appears. After a choice, focus moves to the page heading. |
