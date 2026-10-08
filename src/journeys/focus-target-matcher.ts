// Matching for `reach`, `dismiss` and `expect_focus_on`, plus "did you mean"
// suggestions when a target is never reached.

export interface FocusCandidate {
  /** Engine B role and accessible name. */
  role: string;
  name: string;
  /** Engine A announcement; several phrases are joined with " | ". */
  announcement: string;
}

const ROLE_WORDS = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "option",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "tab",
  "switch",
  "slider",
  "spinbutton",
  "heading",
  "dialog",
  "alertdialog",
  "region",
  "img",
  "generic",
]);

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function splitParts(text: string): string[] {
  return text.split(",").map(normalizeText).filter((part) => part !== "");
}

/** "Checkout, button" → "Checkout"; a target without a trailing role word is all name. */
export function targetName(target: string): string {
  const lastComma = target.lastIndexOf(",");
  if (lastComma === -1) return target.trim();
  const possibleRole = normalizeText(target.slice(lastComma + 1));
  return ROLE_WORDS.has(possibleRole) ? target.slice(0, lastComma).trim() : target.trim();
}

/**
 * Engine B: the target equals "<name>, <role>" or just "<name>".
 * Engine A: every comma-separated part of the target is a part of one spoken
 * phrase, in any order ("Add to cart, button" matches "button, Add to cart").
 * Substring matching is deliberately not used: "Cart" must not match "Add to cart".
 */
export function matchesTarget(target: string, candidate: FocusCandidate): boolean {
  const normalizedTarget = normalizeText(target);
  const name = normalizeText(candidate.name);
  if (name !== "" && (normalizedTarget === name || normalizedTarget === `${name}, ${normalizeText(candidate.role)}`)) {
    return true;
  }
  const targetParts = splitParts(target);
  if (targetParts.length === 0) return false;
  return candidate.announcement.split(" | ").some((phrase) => {
    const phraseParts = new Set(splitParts(phrase));
    return targetParts.every((part) => phraseParts.has(part));
  });
}

export function levenshteinDistance(first: string, second: string): number {
  let previousRow = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 1; i <= first.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= second.length; j++) {
      const substitutionCost = first[i - 1] === second[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        (previousRow[j] ?? 0) + 1,
        (currentRow[j - 1] ?? 0) + 1,
        (previousRow[j - 1] ?? 0) + substitutionCost,
      );
    }
    previousRow = currentRow;
  }
  return previousRow[second.length] ?? 0;
}

/** The `count` heard texts closest to the target, most similar first, without duplicates. */
export function closestMatches(target: string, heard: string[], count = 3): string[] {
  const normalizedTarget = normalizeText(target);
  const unique = [...new Set(heard.filter((text) => text.trim() !== ""))];
  return unique
    .map((text) => ({ text, distance: levenshteinDistance(normalizedTarget, normalizeText(text)) }))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, count)
    .map((entry) => entry.text);
}
