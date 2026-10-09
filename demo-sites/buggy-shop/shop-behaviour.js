// Pebble & Pine (buggy shop) — behaviour for every page.
// Each setUp function does nothing on pages that lack its elements.
// This copy contains planted accessibility bugs; see PLANTED-BUGS.md.

const COOKIE_CHOICE_STORAGE_KEY = "pebble-and-pine-cookie-choice";

/** Makes everything except an open overlay unreachable, or reachable again. */
function setPageInert(isInert) {
  const pageRegions = document.querySelectorAll(
    "body > .skip-link, body > header, body > main, body > footer",
  );
  for (const region of pageRegions) {
    region.inert = isInert;
  }
}

function formatPrice(amount) {
  return `$${amount.toFixed(2)}`;
}

function setUpCartButton() {
  const cartButton = document.querySelector(".cart-button");
  cartButton?.addEventListener("click", () => {
    window.location.href = "cart.html";
  });
}

// Planted bug BF-001 (mobile only): below 700px wide the menu toggle is a
// <div> with a click handler and no role or tabindex, so Tab skips it and the
// nav links inside the collapsed menu can't be reached with a keyboard.
function setUpMenuToggle() {
  const toggle = document.querySelector(".menu-toggle");
  const header = document.querySelector(".site-header");
  toggle?.addEventListener("click", () => {
    header.classList.toggle("menu-open");
  });
}

function hasCookieChoiceBeenMade() {
  try {
    return sessionStorage.getItem(COOKIE_CHOICE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function rememberCookieChoice(choice) {
  try {
    sessionStorage.setItem(COOKIE_CHOICE_STORAGE_KEY, choice);
  } catch {
    // Storage can be blocked; the banner then simply shows again next time.
  }
}

function setUpCookieBanner() {
  const banner = document.querySelector(".cookie-banner");
  if (!banner) return;

  const skipBanner = new URLSearchParams(window.location.search).get("no-cookie-banner") === "1";
  if (skipBanner || hasCookieChoiceBeenMade()) return;

  banner.hidden = false;
  setPageInert(true);

  banner.addEventListener("click", (event) => {
    const choiceControl = event.target.closest("[data-cookie-choice]");
    if (!choiceControl) return;
    rememberCookieChoice(choiceControl.dataset.cookieChoice);
    banner.hidden = true;
    setPageInert(false);
    // The focused button just disappeared, so give focus a sensible new home.
    document.querySelector("#page-heading")?.focus();
  });
}

function setUpNewsletter() {
  const form = document.querySelector(".newsletter-form");
  const message = document.querySelector(".newsletter-message");
  if (!form || !message) return;

  // Planted bug BF-003: Tab can never leave the newsletter box.
  const newsletterBox = document.querySelector(".newsletter-box");
  const emailInput = document.querySelector("#newsletter-email");
  const subscribeButton = document.querySelector(".newsletter-subscribe-button");
  newsletterBox.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const leavingForwards = !event.shiftKey && document.activeElement === subscribeButton;
    const leavingBackwards = event.shiftKey && document.activeElement === emailInput;
    if (leavingForwards || leavingBackwards) {
      event.preventDefault();
      emailInput.focus();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    message.textContent = "Thanks for subscribing! (This is a demo, so no email was sent.)";
  });
}

function setUpAddToCart() {
  const addButton = document.querySelector(".add-to-cart-button");
  const message = document.querySelector(".cart-message");
  if (!addButton || !message) return;

  addButton.addEventListener("click", () => {
    // Clearing first makes repeated clicks change the text, so each one is noticed.
    message.textContent = "";
    setTimeout(() => {
      message.textContent = "Linen tote bag added to cart.";
    }, 100);
  });
}

function setUpSizeGuide() {
  const trigger = document.querySelector(".size-guide-button");
  const modal = document.querySelector(".size-guide-modal");
  if (!trigger || !modal) return;

  const closeButton = modal.querySelector(".size-guide-close");

  // Planted bug BF-007: focus stays on the trigger behind the open modal,
  // Escape does nothing, and the page behind is not made inert.
  function openSizeGuide() {
    modal.hidden = false;
  }

  function closeSizeGuide() {
    modal.hidden = true;
  }

  trigger.addEventListener("click", openSizeGuide);
  closeButton.addEventListener("click", closeSizeGuide);
}

function createCartItemElement(item) {
  const listItem = document.createElement("li");
  listItem.className = "cart-item";
  listItem.dataset.itemId = item.id;
  listItem.dataset.itemName = item.name;
  listItem.dataset.itemPrice = String(item.price);

  const name = document.createElement("span");
  name.className = "cart-item-name";
  name.textContent = item.name;

  const price = document.createElement("span");
  price.className = "cart-item-price";
  price.textContent = formatPrice(item.price);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove-button";
  const hiddenItemName = document.createElement("span");
  hiddenItemName.className = "visually-hidden";
  hiddenItemName.textContent = ` ${item.name}`;
  removeButton.append("Remove", hiddenItemName);

  listItem.append(name, price, removeButton);
  return listItem;
}

function setUpCart() {
  const list = document.querySelector(".cart-items");
  if (!list) return;

  const emptyMessage = document.querySelector(".cart-empty-message");
  const totalAmount = document.querySelector(".cart-total-amount");
  const statusMessage = document.querySelector(".cart-status-message");

  const items = [...list.querySelectorAll(".cart-item")].map((element) => ({
    id: element.dataset.itemId,
    name: element.dataset.itemName,
    price: Number(element.dataset.itemPrice),
  }));

  function renderCart() {
    list.replaceChildren(...items.map(createCartItemElement));
    emptyMessage.hidden = items.length > 0;
    const total = items.reduce((sum, item) => sum + item.price, 0);
    totalAmount.textContent = formatPrice(total);
  }

  list.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".remove-button");
    if (!removeButton) return;

    const removedIndex = items.findIndex(
      (item) => item.id === removeButton.closest(".cart-item").dataset.itemId,
    );
    const [removedItem] = items.splice(removedIndex, 1);
    renderCart();
    statusMessage.textContent = `${removedItem.name} removed from your cart.`;
    // Planted bug BF-006: the focused button was destroyed and focus is not moved.
  });

  const checkoutControl = document.querySelector(".checkout-button");
  checkoutControl?.addEventListener("click", () => {
    window.location.href = "checkout.html";
  });
}

function setUpCheckoutForm() {
  const form = document.querySelector(".checkout-form");
  const message = document.querySelector(".checkout-message");
  if (!form || !message) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = form.elements.namedItem("name").value.trim();
    message.textContent = `Thank you, ${name}! Your order has been placed. (This is a demo, so nothing was ordered.)`;
  });
}

setUpCartButton();
setUpMenuToggle();
setUpCookieBanner();
setUpNewsletter();
setUpAddToCart();
setUpSizeGuide();
setUpCart();
setUpCheckoutForm();
