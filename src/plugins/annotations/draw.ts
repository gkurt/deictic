/**
 * Drawing with the pointer, wherever marks go: the page in annotate mode, or a picture in the editor.
 * Each says where an event is in its marks' coordinates; this is the toolbar, its keys and the gestures.
 *
 * The toolbar says nothing in words: each tool is an icon whose tooltip is its name and its key
 * (`aria-keyshortcuts`, which the overlay's tooltip draws as keycaps).
 */
import type { Point, Shape } from './index.ts';
import { FONT, guess, type Measure } from './svg.ts';

export const TOOLS_STYLE = `
.annotations-tools { display: flex; flex-wrap: wrap; gap: 4px; }
.annotations-tools .icon { display: inline-flex; align-items: center; justify-content: center; padding: 3px 5px; }
.annotations-tools .icon svg { width: 16px; height: 16px; }
.annotations-tools .gap { width: 1px; align-self: stretch; margin: 2px 4px; background: var(--deictic-line); }
.annotations-tools button[aria-pressed='true'] { background: var(--deictic-accent); border-color: var(--deictic-accent); color: var(--deictic-on-accent); }
.annotations-tools .end { margin-left: auto; }
`;

type Tool = 'pointer' | 'box' | 'arrow' | 'pen' | 'note';
const TOOLS: Tool[] = ['box', 'arrow', 'pen', 'note'];
const NAMES: Record<Tool, string> = { pointer: 'Pointer', box: 'Box', arrow: 'Arrow', pen: 'Pen', note: 'Note' };
/** The key that picks each, alone. */
const KEYS: Record<Tool, string> = { pointer: 'V', box: 'B', arrow: 'A', pen: 'P', note: 'N' };

/** The key held with a letter for a command, as the platform has it, by the name `aria-keyshortcuts` gives it. */
export const MOD = /Mac|iP(?:hone|ad)/.test(navigator.platform) ? 'Meta' : 'Control';

/** Each icon's strokes, on a 24-pixel grid: drawn here, so the page half needs nothing to show them. */
const ICONS = {
  pointer: '<path d="M5 3l14 7-6 2-2 6z"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  arrow: '<path d="M6 18 18 6M9 6h9v9"/>',
  pen: '<path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"/>',
  note: '<path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5"/>',
  undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  clear: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
} as const;

/** A button that shows an icon: its name is its tooltip, with its keys, and what a screen reader says. */
function iconButton(icon: keyof typeof ICONS, name: string, keys: string, run: () => void): HTMLButtonElement {
  const el = button('', keys, run);
  el.className = 'icon';
  el.title = name;
  el.setAttribute('aria-label', name);
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon]}</svg>`;
  return el;
}

/** Text's width as the marks draw it, by a canvas's measure, which the guess stands in for without one. */
export function measurer(): Measure {
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx === null) return guess;
  ctx.font = `${FONT}px system-ui, sans-serif`;
  return (text) => ctx.measureText(text).width;
}

/** A button, and the keys that do what it does (`Control+Z`), which its tooltip shows. */
export function button(label: string, keys: string, run: () => void): HTMLButtonElement {
  const el = Object.assign(document.createElement('button'), { type: 'button', textContent: label });
  el.setAttribute('aria-keyshortcuts', keys);
  el.addEventListener('click', run);
  return el;
}

export interface DrawingOptions {
  /** What takes the pointer to draw on. */
  surface: HTMLElement;
  /** Where an event is, in the coordinates the marks are kept in. */
  at: (e: PointerEvent) => Point;
  /** Shows the shape being drawn, or nothing once it's done. */
  preview: (shape: Shape | undefined) => void;
  add: (shape: Shape) => void;
  removeLast: () => void;
  clear: () => void;
  /**
   * Where the page stays usable between marks (a recording's toolbar): a pointer tool comes first and is
   * picked to start with, and this hears whether a drawing tool is picked, to let the surface take the
   * pointer only then.
   */
  drawing?: (on: boolean) => void;
}

/**
 * Draws on `surface` with the tool picked: answers the toolbar (the tools, then removing the last mark or all), for the
 * caller to add its own buttons to, and what ends it, which lets its keys go.
 *
 * Each tool has a key, its own letter, and they work for as long as there's drawing: all the while over a surface
 * that takes the pointer, and where the page stays usable only once a drawing tool is picked, as the page's keys are
 * its own until then. There, the pointer's key and Esc give the page back.
 */
export function drawing({ surface, at, preview, add, removeLast, clear, drawing: on }: DrawingOptions) {
  const tools = document.createElement('div');
  tools.className = 'annotations-tools';

  let tool: Tool = on === undefined ? 'box' : 'pointer';
  const picks = (on === undefined ? TOOLS : (['pointer', ...TOOLS] as Tool[])).map((t) => ({
    t,
    el: iconButton(t, NAMES[t], KEYS[t], () => pick(t)),
  }));
  const pick = (t: Tool) => {
    tool = t;
    for (const p of picks) p.el.setAttribute('aria-pressed', String(p.t === t));
    on?.(t !== 'pointer');
  };
  const gap = document.createElement('span');
  gap.className = 'gap';
  tools.append(
    ...picks.map((p) => p.el),
    gap,
    iconButton('undo', 'Undo', `${MOD}+Z`, removeLast),
    // With Shift: it takes every mark, and nothing brings them back.
    iconButton('clear', 'Clear', 'Shift+Backspace', clear),
  );
  pick(tool);

  /** What a key does here, or nothing: a letter alone picks its tool. */
  const commandOf = (e: KeyboardEvent): (() => void) | undefined => {
    const mod = e.ctrlKey || e.metaKey;
    // By the letter typed, and by where the key is on a keyboard that types no Latin letter there.
    const letter = /^[a-z]$/i.test(e.key) ? e.key.toUpperCase() : e.code.replace(/^Key/, '');
    if (mod && !e.shiftKey && letter === 'Z') return removeLast;
    if (e.shiftKey && !mod && e.key === 'Backspace') return clear;
    if (mod || e.shiftKey) return undefined;
    if (e.key === 'Escape') return on === undefined ? undefined : () => pick('pointer');
    const picked = picks.find((p) => KEYS[p.t] === letter);
    return picked === undefined ? undefined : () => pick(picked.t);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.altKey) return;
    if (on !== undefined && tool === 'pointer') return;
    // A note being typed is the note's. Any other field that still has the focus is under the surface, which takes
    // the pointer: it isn't in use, and gets no key of these.
    const [target] = e.composedPath();
    if (target instanceof Node && surface.contains(target)) return;
    const run = commandOf(e);
    if (run === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    run();
  };
  // Before the page hears it, so a letter here is never one of the page's own shortcuts.
  window.addEventListener('keydown', onKey, true);

  surface.style.cursor = 'crosshair';
  const shapeFrom = (from: Point, to: Point, points: Point[]): Shape | undefined => {
    if (tool === 'pen') return points.length > 1 ? { kind: 'pen', points } : undefined;
    if (Math.hypot(to.x - from.x, to.y - from.y) < 4) return undefined;
    if (tool === 'arrow') return { kind: 'arrow', from, to };
    return {
      kind: 'box',
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    };
  };

  surface.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    if (tool === 'note') return note(at(e), e);
    const from = at(e);
    const points = [from];
    surface.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      points.push(at(m));
      preview(shapeFrom(from, at(m), points));
    };
    const up = (u: PointerEvent) => {
      surface.removeEventListener('pointermove', move);
      preview(undefined);
      const shape = shapeFrom(from, at(u), points);
      if (shape !== undefined) add(shape);
    };
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', up, { once: true });
  });

  /** A field where the note goes: Enter places what's typed, as does leaving it; Esc, or nothing typed, places nothing. */
  const note = (point: Point, e: PointerEvent) => {
    const field = Object.assign(document.createElement('input'), { placeholder: 'Note', ariaLabel: 'Note' });
    // Esc is the field's while it's there, not the popup's.
    field.dataset['deicticModal'] = '';
    // Its own colours: on the page, outside the popup, it would take the page's text colour on deictic's dark field.
    field.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:220px;pointer-events:auto;cursor:text;color:var(--deictic-fg);background:var(--deictic-bg);border-color:var(--deictic-accent)`;
    surface.append(field);
    // Once: taking the field away blurs it, while it's still there to be asked.
    let over = false;
    const end = (placed: boolean) => {
      if (over) return;
      over = true;
      const text = field.value.trim();
      field.remove();
      if (placed && text !== '') add({ kind: 'note', at: point, text });
    };
    field.addEventListener('keydown', (k) => {
      if (k.key === 'Enter') end(true);
      if (k.key !== 'Escape') return;
      k.stopPropagation();
      end(false);
    });
    field.addEventListener('blur', () => end(true));
    // Now, not a frame later: the pointerdown's default is prevented, so no mousedown takes focus back.
    field.focus();
  };

  return { tools, stop: () => window.removeEventListener('keydown', onKey, true) };
}
