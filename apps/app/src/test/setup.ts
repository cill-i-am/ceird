import "@testing-library/jest-dom/vitest";

class TestResizeObserver implements ResizeObserver {
  private readonly observedElements = new Set<Element>();

  observe(target: Element) {
    this.observedElements.add(target);
  }

  unobserve(target: Element) {
    this.observedElements.delete(target);
  }

  disconnect() {
    this.observedElements.clear();
  }
}

function getElementAnimations() {
  return [];
}

globalThis.ResizeObserver ??= TestResizeObserver;

if (typeof Element !== "undefined") {
  Element.prototype.getAnimations ??= getElementAnimations;
  Element.prototype.scrollIntoView ??= vi.fn();
}
