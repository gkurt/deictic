/** The little the overlay's parts all draw with. */

export function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

/** Puts a fixed box over `r`. */
export function place(el: HTMLElement, r: DOMRect): void {
  Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
}

/** `button.tab`: the element as a selector, its own classes only, for a person to tell it by. */
export const nameOf = (el: Element) => `${el.localName}${[...el.classList].map((c) => `.${c}`).join('')}`;

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
