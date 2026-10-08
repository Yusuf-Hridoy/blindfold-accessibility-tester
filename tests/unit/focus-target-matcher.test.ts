import { describe, expect, it } from "vitest";
import { closestMatches, matchesTarget, targetName } from "../../src/journeys/focus-target-matcher.ts";

const addToCart = { role: "button", name: "Add to cart", announcement: "button, Add to cart" };

describe("matchesTarget", () => {
  it("matches the exact Engine B name and role", () => {
    expect(matchesTarget("Add to cart, button", addToCart)).toBe(true);
  });

  it("ignores case and extra whitespace", () => {
    expect(matchesTarget("  add  TO cart ,   BUTTON ", addToCart)).toBe(true);
  });

  it("matches the name alone", () => {
    expect(matchesTarget("Add to cart", addToCart)).toBe(true);
  });

  it("matches the Engine A announcement in any order when Engine B has no name", () => {
    expect(matchesTarget("Email address, textbox", { role: "unknown", name: "", announcement: "textbox, Email address, required" })).toBe(true);
  });

  it("matches one phrase among several announcements", () => {
    expect(matchesTarget("Close, button", { role: "", name: "", announcement: "dialog, Size guide | button, Close" })).toBe(true);
  });

  it("does not match a part of a longer name", () => {
    expect(matchesTarget("Cart", addToCart)).toBe(false);
  });

  it("does not match the wrong role", () => {
    expect(matchesTarget("Checkout, button", { role: "link", name: "Checkout", announcement: "link, Checkout" })).toBe(false);
  });
});

describe("targetName", () => {
  it("drops a trailing role word", () => {
    expect(targetName("Checkout, button")).toBe("Checkout");
    expect(targetName("Remove Linen tote bag, button")).toBe("Remove Linen tote bag");
  });

  it("keeps names whose comma isn't followed by a role", () => {
    expect(targetName("Hello, world")).toBe("Hello, world");
  });
});

describe("closestMatches", () => {
  it("returns the 3 closest things heard, most similar first, without duplicates", () => {
    // Edit distances to "checkout, button": 6, 12, 10, 17, 12. Ties keep the order heard.
    const heard = ["Checkout, link", "Shop, link", "Checkout, link", "button", "Remove Stoneware mug, button", "Cart, link"];
    expect(closestMatches("Checkout, button", heard)).toEqual(["Checkout, link", "button", "Shop, link"]);
  });
});
