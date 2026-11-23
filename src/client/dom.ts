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

/**
 * A button for the tool panel: an icon (its strokes, on a 24-pixel grid), named by its tooltip and for a screen
 * reader, with the keys that press it (`B`, `Control+Z`), which the tooltip shows and the panel hears.
 */
export function toolButton(strokes: string, name: string, keys: string | undefined, run: () => void): HTMLButtonElement {
  const el = Object.assign(document.createElement('button'), { type: 'button', className: 'icon', title: name });
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${strokes}</svg>`;
  el.setAttribute('aria-label', name);
  if (keys !== undefined) el.setAttribute('aria-keyshortcuts', keys);
  el.addEventListener('click', run);
  return el;
}

/** The key held with a letter for a command, as the platform has it, by the name `aria-keyshortcuts` gives it. */
export const MOD = typeof navigator !== 'undefined' && /Mac|iP(?:hone|ad)/.test(navigator.platform) ? 'Meta' : 'Control';
