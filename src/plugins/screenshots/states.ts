/**
 * What a copy of the DOM loses: which elements are hovered and focused. The `rrweb()` renderer reads it as it takes
 * the page, and its server half gives the rebuilt page those states again (`playwright.ts`). Self-contained, with
 * nothing from outside it, so a test can run this very function in a browser.
 */
import type { States } from './playwright.ts';

/** Which nodes match each state now, by the snapshot's IDs (`id`), through open shadow roots, deictic's overlay left out. */
export function statesOf(id: (el: Element) => number, root: Document = document): States {
  const pseudo = { hover: ':hover', focus: ':focus', focusVisible: ':focus-visible', focusWithin: ':focus-within' } as const;
  const states: States = {};
  for (const [name, selector] of Object.entries(pseudo) as [keyof States, string][]) {
    const ids: number[] = [];
    const within = (inside: Document | ShadowRoot) => {
      for (const el of inside.querySelectorAll(selector)) {
        if (el.localName === 'deictic-overlay') continue;
        const known = id(el);
        if (known !== -1) ids.push(known);
        if (el.shadowRoot !== null) within(el.shadowRoot);
      }
    };
    within(root);
    if (ids.length > 0) states[name] = ids;
  }
  return states;
}
