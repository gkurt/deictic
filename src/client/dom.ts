/** The little the overlay's parts all draw with. */
import type { Target } from '#src/index.ts';

/** The attribute the transform marks an element with: `file:line:column`. */
export const ATTRIBUTE = 'data-deictic';

/** An element's place in the source, as its mark has it, or nothing for one with none. */
export function targetOf(el: Element): Target | undefined {
  const at = el.getAttribute(ATTRIBUTE);
  const match = at === null ? null : /^(.*):(\d+):(\d+)$/.exec(at);
  if (match === null) return undefined;
  return { loc: { file: match[1]!, line: Number(match[2]), column: Number(match[3]) }, tag: el.localName };
}

/** Every element on the page from the same place in the source as `el`. */
export const sameAs = (el: Element) => [...document.querySelectorAll(`[${ATTRIBUTE}="${CSS.escape(el.getAttribute(ATTRIBUTE) ?? '')}"]`)];

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

/**
 * The control in `within` that a key is for, by its `aria-keyshortcuts`: a key alone, or with the keys it names.
 * `loose` takes a key alone whatever is held with it, for while a shortcut's keys are held to point.
 */
export function controlFor(within: ParentNode, e: KeyboardEvent, loose = false): HTMLElement | undefined {
  // By the letter typed, and by where the key is where it types no Latin letter (another layout, or Alt held).
  const key = /^[a-z]$/i.test(e.key) ? e.key.toUpperCase() : e.code.startsWith('Key') ? e.code.slice(3) : e.key;
  const held = [e.ctrlKey && 'Control', e.metaKey && 'Meta', e.shiftKey && 'Shift'].filter((m) => m !== false);
  for (const el of within.querySelectorAll<HTMLElement>('[aria-keyshortcuts]')) {
    if (el instanceof HTMLButtonElement && el.disabled) continue;
    // One that isn't shown now: a recording's Stop while none is going.
    if (el.offsetParent === null) continue;
    for (const keys of (el.getAttribute('aria-keyshortcuts') ?? '').split(' ')) {
      const named = keys.split('+');
      if (named.at(-1) !== key) continue;
      const mods = named.slice(0, -1);
      if (mods.length === 0 ? loose || held.length === 0 : mods.length === held.length && mods.every((m) => held.includes(m))) return el;
    }
  }
  return undefined;
}

/** The key held with a letter for a command, as the platform has it, by the name `aria-keyshortcuts` gives it. */
export const MOD = typeof navigator !== 'undefined' && /Mac|iP(?:hone|ad)/.test(navigator.platform) ? 'Meta' : 'Control';

/**
 * What the page hears on `window` as the popup opens over it on an element (its `detail` a `PopupOpened`) and as
 * it closes: for a page that moves on its own to hold still meanwhile, as deictic's site does. Not for one pinned.
 */
export const POPUP_OPENED = 'deictic:open';
export const POPUP_CLOSED = 'deictic:close';

export interface PopupOpened {
  /** The element it's open on. */
  element: Element;
  /** The plugin whose tab it opened at. */
  tab: string;
}
