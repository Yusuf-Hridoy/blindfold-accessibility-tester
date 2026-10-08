import type { RuleId } from "../types/scan-result-types.ts";

export interface RuleDescription {
  id: RuleId;
  title: string;
  wcag: string;
  whyItMatters: string;
  fixHint: string;
}

export const RULE_CATALOG: Record<RuleId, RuleDescription> = {
  "BF-001": {
    id: "BF-001",
    title: "Control can't be reached by keyboard",
    wcag: "2.1.1 Keyboard (Level A)",
    whyItMatters:
      "People who use a keyboard or a screen reader move between controls with the Tab key. A control that only responds to the mouse doesn't exist for them, so they can't use it at all.",
    fixHint:
      'Use a real <button> or <a href> element. If another element must be used, give it tabindex="0" and a suitable role, and make it respond to Enter and Space.',
  },
  "BF-002": {
    id: "BF-002",
    title: "Control has no accessible name",
    wcag: "4.1.2 Name, Role, Value (Level A)",
    whyItMatters:
      'Screen readers announce controls by name. Without one, people hear only "button" or "edit text" and have to guess what it does.',
    fixHint:
      "Give the control visible text, an aria-label, or aria-labelledby pointing at visible text. Label form fields with <label for>.",
  },
  "BF-003": {
    id: "BF-003",
    title: "Keyboard focus gets trapped",
    wcag: "2.1.2 No Keyboard Trap (Level A)",
    whyItMatters:
      "Keyboard users move through a page with Tab. If focus can't leave part of the page, they're stuck and can't reach anything after it.",
    fixHint:
      "Remove scripts that force focus back into the area. Only keep focus inside an open modal dialog, and let Escape close it.",
  },
  "BF-004": {
    id: "BF-004",
    title: "Keyboard focus is not visible",
    wcag: "2.4.7 Focus Visible (Level AA)",
    whyItMatters:
      "Sighted keyboard users need to see where focus is, just as mouse users see the pointer. Without a focus indicator they lose their place.",
    fixHint:
      "Don't remove the outline without a replacement. Add a :focus-visible style, such as an outline or box-shadow, that contrasts with the background.",
  },
};

export const RULE_IDS_IN_ORDER: RuleId[] = ["BF-001", "BF-002", "BF-003", "BF-004"];
