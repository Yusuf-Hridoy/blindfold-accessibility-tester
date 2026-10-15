import { FOCUSED_ON_LOAD_PREFIX } from "../passes/keyboard-pass-walker.ts";
import type { Bf002Reason, CollectedScanData, FocusStop, RuleFinding } from "../types/scan-result-types.ts";

/**
 * Roles a user can only identify by name (ARIA marks their name as required).
 * Other roles (list, code, group, generic…) are announced with their content,
 * so a missing name isn't a barrier there.
 */
const NAME_REQUIRED_ROLES = new Set([
  "alertdialog",
  "application",
  "button",
  "checkbox",
  "columnheader",
  "combobox",
  "dialog",
  "grid",
  "gridcell",
  "img",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "meter",
  "option",
  "progressbar",
  "radio",
  "radiogroup",
  "rowheader",
  "scrollbar",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "table",
  "tabpanel",
  "textbox",
  "tree",
  "treegrid",
  "treeitem",
]);

/** Roles whose announcement includes their current value, which isn't a name. */
const VALUE_ROLES = new Set(["combobox", "listbox", "textbox", "searchbox", "spinbutton", "slider"]);

/** Words Guidepup uses for roles, the first part of most announcements. */
const ROLE_WORDS = new Set([
  ...NAME_REQUIRED_ROLES,
  "article",
  "banner",
  "blockquote",
  "code",
  "complementary",
  "contentinfo",
  "document",
  "figure",
  "form",
  "generic",
  "group",
  "heading",
  "list",
  "listitem",
  "main",
  "navigation",
  "note",
  "paragraph",
  "region",
  "row",
  "search",
  "section",
  "status",
  "toolbar",
  "tooltip",
]);

/** Parts of a Guidepup announcement that describe state, not the name. */
const STATE_PHRASES = [
  /^(not )?(checked|pressed|expanded|selected)$/,
  /^(collapsed|mixed|disabled|required|invalid|read ?only|busy|modal|multi-?selectable|current( page)?)$/,
  /^has popup( \w+)?$/,
  /^(position|set size|level) \d+$/,
  /^orientated \w+$/,
];

/** What Guidepup said besides the role word and states (a name, a description, or a control's value). */
export function spokenTextBesidesRole(stop: Pick<FocusStop, "announcement" | "role">): string[] {
  const announcement = stop.announcement.startsWith(FOCUSED_ON_LOAD_PREFIX)
    ? stop.announcement.slice(FOCUSED_ON_LOAD_PREFIX.length).trim()
    : stop.announcement.trim();
  if (announcement === "" || /^\(.*\)$/.test(announcement)) return [];
  let parts = announcement.split(", ").map((part) => part.trim()).filter((part) => part !== "");
  const [first] = parts;
  if (first !== undefined && (first === stop.role || ROLE_WORDS.has(first.toLowerCase()))) parts = parts.slice(1);
  return parts.filter((part) => !STATE_PHRASES.some((phrase) => phrase.test(part.toLowerCase())));
}

export function isValueRole(role: string): boolean {
  return VALUE_ROLES.has(role);
}

/**
 * True when Guidepup said something that names the element: anything besides
 * the role word, states and (for value controls) the current value.
 */
export function screenReaderSpokeAName(stop: Pick<FocusStop, "announcement" | "role">): boolean {
  const spoken = spokenTextBesidesRole(stop);
  return (isValueRole(stop.role) ? spoken.slice(1) : spoken).length > 0;
}

function reasonFor(stop: FocusStop): Bf002Reason | null {
  // "unknown" means the snapshot couldn't be read, which says nothing about the name.
  if (stop.role === "unknown") return null;
  // Hidden wins: adding a label wouldn't help while the screen reader can't see the control.
  if (stop.hiddenFromScreenReaders) return "hidden-from-screen-readers";
  if (stop.accessibleName.trim() !== "" || !NAME_REQUIRED_ROLES.has(stop.role)) return null;
  // Both engines must find no name: Engine B's snapshot misses some names
  // the browser and Guidepup do have (e.g. a <summary>'s text).
  return screenReaderSpokeAName(stop) ? null : "missing-name";
}

/**
 * BF-002: focus stops a screen reader can't name, because the name is empty or
 * the control is hidden. Also the other radios of a reached radio group (Tab
 * skips them, arrow keys reach them): only Engine B sees those, so their
 * confidence stays "likely".
 */
export function findUnnamedControls(data: CollectedScanData): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const reportedElementIds = new Set<number>();
  const radiosReachedByArrowKeys = new Set(data.reachableWithArrowKeys?.nativeRadioGroup ?? []);
  for (const stop of data.focusStops) {
    const reason = reasonFor(stop);
    if (reason === null || reportedElementIds.has(stop.elementId)) continue;
    reportedElementIds.add(stop.elementId);
    findings.push({
      ruleId: "BF-002",
      reason,
      elementId: stop.elementId,
      selector: stop.selector,
      description: stop.description,
      step: stop.step,
    });
  }
  // After the focus stops, so a group's reached radio comes first.
  for (const element of data.mousePassElements) {
    if (!radiosReachedByArrowKeys.has(element.elementId) || element.role !== "radio" || element.accessibleName.trim() !== "") continue;
    if (reportedElementIds.has(element.elementId)) continue;
    reportedElementIds.add(element.elementId);
    findings.push({
      ruleId: "BF-002",
      reason: "missing-name",
      elementId: element.elementId,
      selector: element.selector,
      description: element.description,
      step: null,
    });
  }
  return findings;
}
