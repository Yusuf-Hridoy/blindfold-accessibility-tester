// Helpers that run inside the scanned page and are shared by every pass:
// stable element ids, unique CSS selectors, short descriptions, visibility.
// Installed as an init script, so they exist before page scripts run.

export interface PageElementIdentity {
  elementId: number;
  selector: string;
  description: string;
}

export interface PageElementHelpers {
  idFor(element: Element): number;
  elementForId(elementId: number): Element | undefined;
  selectorFor(element: Element): string;
  describe(element: Element): string;
  identify(element: Element): PageElementIdentity;
  isVisible(element: Element): boolean;
}

declare global {
  interface Window {
    __blindfoldElements: PageElementHelpers;
  }
}

export function installPageElementHelpers(): void {
  const idsByElement = new WeakMap<Element, number>();
  const elementsById = new Map<number, Element>();
  let nextElementId = 1;

  function idFor(element: Element): number {
    let elementId = idsByElement.get(element);
    if (elementId === undefined) {
      elementId = nextElementId++;
      idsByElement.set(element, elementId);
      elementsById.set(elementId, element);
    }
    return elementId;
  }

  function hasUniqueId(element: Element): boolean {
    return element.id !== "" && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1;
  }

  function selectorFor(element: Element): string {
    if (hasUniqueId(element)) return `#${CSS.escape(element.id)}`;
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      if (current !== element && hasUniqueId(current)) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      let part = CSS.escape(current.localName);
      const parent: Element | null = current.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter((sibling) => sibling.localName === current?.localName);
        if (sameTagSiblings.length > 1) part += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(" > ");
  }

  function describe(element: Element): string {
    const tag = element.localName;
    const firstClass = element.classList[0];
    const identifier = element.id ? `#${element.id}` : firstClass ? `.${firstClass}` : "";
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const shortText = text.length > 40 ? `${text.slice(0, 39)}…` : text;
    return shortText ? `${tag}${identifier} "${shortText}"` : `${tag}${identifier}`;
  }

  function isVisible(element: Element): boolean {
    if (element.closest("[hidden], [inert]")) return false;
    if (!element.checkVisibility({ visibilityProperty: true })) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  }

  window.__blindfoldElements = {
    idFor,
    elementForId: (elementId) => elementsById.get(elementId),
    selectorFor,
    describe,
    identify: (element) => ({ elementId: idFor(element), selector: selectorFor(element), description: describe(element) }),
    isVisible,
  };
}
