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
  /** The focused element, following focus into open shadow roots (document.activeElement stops at the host). */
  deepActiveElement(): Element | null;
  /**
   * Every element under `root`, including inside open shadow roots, in the
   * order they're rendered: an element, then its shadow tree, then its children.
   */
  deepElements(root: Element | Document | ShadowRoot): Element[];
  /** Every open shadow root under `root` (for observers). */
  deepShadowRoots(root: Element | Document | ShadowRoot): ShadowRoot[];
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

  /** Unique in its own document or shadow root (a selector part is matched within that root). */
  function hasUniqueId(element: Element): boolean {
    const root = element.getRootNode() as Document | ShadowRoot;
    return element.id !== "" && root.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1;
  }

  function selectorFor(element: Element): string {
    const root = element.getRootNode();
    // Inside an open shadow root: Playwright's CSS selectors pierce it from the host.
    const hostPrefix = root instanceof ShadowRoot ? `${selectorFor(root.host)} ` : "";
    if (hasUniqueId(element)) return `${hostPrefix}#${CSS.escape(element.id)}`;
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      if (current !== element && hasUniqueId(current)) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        return `${hostPrefix}${parts.join(" > ")}`;
      }
      let part = CSS.escape(current.localName);
      const parent: Element | null = current.parentElement;
      const shadowRoot = !parent && current.parentNode instanceof ShadowRoot ? current.parentNode : null;
      const siblings = parent?.children ?? shadowRoot?.children;
      if (siblings) {
        const sameTagSiblings = Array.from(siblings).filter((sibling) => sibling.localName === current?.localName);
        if (sameTagSiblings.length > 1) part += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      if (shadowRoot) return `${hostPrefix}${parts.join(" > ")}`;
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

  function deepElements(root: Element | Document | ShadowRoot): Element[] {
    const elements: Element[] = [];
    const visit = (parent: Element | Document | ShadowRoot): void => {
      for (const child of Array.from(parent.children)) {
        elements.push(child);
        if (child.shadowRoot) visit(child.shadowRoot);
        visit(child);
      }
    };
    visit(root);
    return elements;
  }

  function deepShadowRoots(root: Element | Document | ShadowRoot): ShadowRoot[] {
    return deepElements(root).flatMap((element) => (element.shadowRoot ? [element.shadowRoot] : []));
  }

  function deepActiveElement(): Element | null {
    let focused = document.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    return focused;
  }

  window.__blindfoldElements = {
    deepActiveElement,
    deepElements,
    deepShadowRoots,
    idFor,
    elementForId: (elementId) => elementsById.get(elementId),
    selectorFor,
    describe,
    identify: (element) => ({ elementId: idFor(element), selector: selectorFor(element), description: describe(element) }),
    isVisible,
  };
}
