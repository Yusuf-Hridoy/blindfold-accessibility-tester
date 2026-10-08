// Records which elements get mouse-style event listeners. Runs as an init
// script, before any page script, by wrapping EventTarget.prototype.addEventListener.

declare global {
  interface Window {
    __blindfoldHasClickListener: (element: Element) => boolean;
  }
}

export function installClickListenerTracker(): void {
  const clickEventTypes = new Set(["click", "mousedown", "mouseup", "pointerdown"]);
  const inlineHandlerNames = ["onclick", "onmousedown", "onmouseup", "onpointerdown"] as const;
  const elementsWithClickListeners = new WeakSet<Element>();
  const originalAddEventListener = EventTarget.prototype.addEventListener;

  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (clickEventTypes.has(type) && this instanceof Element) {
      elementsWithClickListeners.add(this);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  window.__blindfoldHasClickListener = (element) => {
    if (elementsWithClickListeners.has(element)) return true;
    return inlineHandlerNames.some(
      (handlerName) =>
        element.hasAttribute(handlerName) || typeof (element as HTMLElement)[handlerName] === "function",
    );
  };
}
