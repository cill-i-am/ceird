import type * as React from "react";

export function activeElementIsInside<TElement extends HTMLElement>(
  ref: React.RefObject<TElement | null>
) {
  const { activeElement } = document;

  return (
    activeElement instanceof HTMLElement &&
    ref.current?.contains(activeElement) === true
  );
}
