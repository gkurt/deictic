/**
 * Drawing on the page with the pointer: the tools, as the tool panel has them, and the gestures.
 *
 * The tools say nothing in words: each is an icon whose tooltip is its name and its key (`aria-keyshortcuts`, which
 * the panel hears and the overlay's tooltip draws as keycaps). While one is picked it has the page (`hold`): the
 * surface takes the pointer, so drawing never clicks the page, until the panel gives the page back.
 */
import { MOD, toolButton } from '#src/client/dom.ts';
import type { ToolPanel } from '#src/index.ts';

import type { Point, Shape } from './index.ts';
import { FONT, guess, type Measure } from './svg.ts';

const STYLE = `
.annotations-tools .gap { width: 1px; align-self: stretch; margin: 2px; background: rgb(255 255 255 / 0.12); }
.tool-panel.vertical .annotations-tools .gap { width: auto; height: 1px; }
`;

type Tool = 'box' | 'arrow' | 'pen' | 'note';
const TOOLS: Tool[] = ['box', 'arrow', 'pen', 'note'];
const NAMES: Record<Tool, string> = { box: 'Box', arrow: 'Arrow', pen: 'Pen', note: 'Note' };
/** The key that picks each, alone. */
const KEYS: Record<Tool, string> = { box: 'M', arrow: 'A', pen: 'B', note: 'N' };

/** Each icon's strokes, on a 24-pixel grid: drawn here, so the page half needs nothing to show them. */
const ICONS = {
  box: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  arrow: '<path d="M6 18 18 6M9 6h9v9"/>',
  pen: '<path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"/>',
  note: '<path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5"/>',
  undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  clear: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
} as const;

/** Text's width as the marks draw it, by a canvas's measure, which the guess stands in for without one. */
export function measurer(): Measure {
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx === null) return guess;
  ctx.font = `${FONT}px system-ui, sans-serif`;
  return (text) => ctx.measureText(text).width;
}

export interface DrawingOptions {
  /** What takes the pointer to draw on, while a tool is picked. */
  surface: HTMLElement;
  /** Where an event is, in the coordinates the marks are kept in. */
  at: (e: PointerEvent) => Point;
  /** Shows the shape being drawn, or nothing once it's done. */
  preview: (shape: Shape | undefined) => void;
  add: (shape: Shape) => void;
  removeLast: () => void;
  clear: () => void;
  /** The tool panel's `hold`: a picked tool has the page until the panel gives it back. */
  hold: ToolPanel['hold'];
}

/**
 * Draws on `surface` with the tool picked: answers the tools, as a group for the tool panel (the tools, then
 * removing the last mark or all).
 */
export function drawing({ surface, at, preview, add, removeLast, clear, hold }: DrawingOptions): HTMLElement {
  const tools = document.createElement('div');
  tools.className = 'tool-group annotations-tools';

  // None until one is picked: the page is the page's.
  let tool: Tool | undefined;
  let release: (() => void) | undefined;
  const picks = TOOLS.map((t) => ({ t, el: toolButton(ICONS[t], NAMES[t], KEYS[t], () => pick(t)) }));
  const show = () => {
    for (const p of picks) p.el.setAttribute('aria-pressed', String(p.t === tool));
    surface.style.pointerEvents = tool === undefined ? 'none' : 'auto';
  };
  const pick = (t: Tool) => {
    tool = t;
    // The page's, once: another of these tools takes over from the one that had it.
    release ??= hold(() => {
      tool = undefined;
      release = undefined;
      show();
    });
    show();
  };
  const gap = document.createElement('span');
  gap.className = 'gap';
  tools.append(
    Object.assign(document.createElement('style'), { textContent: STYLE }),
    ...picks.map((p) => p.el),
    gap,
    toolButton(ICONS.undo, 'Undo', `${MOD}+Z`, removeLast),
    // With Shift: it takes every mark, and nothing brings them back.
    toolButton(ICONS.clear, 'Clear', 'Shift+Backspace', clear),
  );
  show();

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

  return tools;
}
