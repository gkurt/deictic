/**
 * Drawing with the pointer, wherever marks go: the page in annotate mode, or a picture in the editor.
 * Each says where an event is in its marks' coordinates; this is the toolbar and the gestures.
 */
import type { Point, Shape } from './index.ts';
import { FONT, guess, type Measure } from './svg.ts';

export const TOOLS_STYLE = `
.annotations-tools { display: flex; flex-wrap: wrap; gap: 4px; }
.annotations-tools .icon { display: inline-flex; align-items: center; justify-content: center; padding: 3px 5px; }
.annotations-tools .icon svg { width: 16px; height: 16px; }
.annotations-tools .gap { width: 1px; align-self: stretch; margin: 2px 4px; background: var(--deictic-line); }
.annotations-tools button[aria-pressed='true'] { background: var(--deictic-accent); border-color: var(--deictic-accent); color: #fff; }
.annotations-tools .end { margin-left: auto; }
.annotations-hint { margin: 6px 0 0; font-size: 12px; color: var(--deictic-muted); }
`;

type Tool = 'pointer' | 'box' | 'arrow' | 'pen' | 'note';
const TOOLS: Tool[] = ['box', 'arrow', 'pen', 'note'];
const NAMES: Record<Tool, string> = {
  pointer: 'Use the page',
  box: 'Draw a box',
  arrow: 'Draw an arrow',
  pen: 'Draw freehand',
  note: 'Add a note',
};

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

/** A button that shows an icon, with its name as its tooltip and for a screen reader. */
export function iconButton(icon: keyof typeof ICONS, name: string, run: () => void): HTMLButtonElement {
  const el = button('', name, run);
  el.className = 'icon';
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

export function button(label: string, title: string, run: () => void): HTMLButtonElement {
  const el = Object.assign(document.createElement('button'), { type: 'button', textContent: label, title });
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
 * caller to add its own buttons to, and a hint for the tool.
 */
export function drawing({ surface, at, preview, add, removeLast, clear, drawing: on }: DrawingOptions) {
  const tools = document.createElement('div');
  tools.className = 'annotations-tools';
  const hint = document.createElement('p');
  hint.className = 'annotations-hint';

  let tool: Tool = on === undefined ? 'box' : 'pointer';
  const picks = (on === undefined ? TOOLS : (['pointer', ...TOOLS] as Tool[])).map((t) => ({
    t,
    el: iconButton(t, NAMES[t], () => pick(t)),
  }));
  const pick = (t: Tool) => {
    tool = t;
    for (const p of picks) p.el.setAttribute('aria-pressed', String(p.t === t));
    on?.(t !== 'pointer');
    hint.textContent =
      t === 'pointer'
        ? 'Use the page; pick a tool to draw.'
        : t === 'note'
          ? 'Click where the note goes, type it, Enter to place it.'
          : 'Drag to draw.';
  };
  const gap = document.createElement('span');
  gap.className = 'gap';
  tools.append(
    ...picks.map((p) => p.el),
    gap,
    iconButton('undo', 'Remove the last mark', removeLast),
    iconButton('clear', 'Remove every mark', clear),
  );
  pick(tool);

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

  /** A field where the note goes: Enter places what's typed, leaving it empty or blurring it places nothing. */
  const note = (point: Point, e: PointerEvent) => {
    const field = Object.assign(document.createElement('input'), { placeholder: 'Note, then Enter' });
    // Its own colours: on the page, outside the popup, it would take the page's text colour on deictic's dark field.
    field.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:220px;pointer-events:auto;cursor:text;color:var(--deictic-fg);background:var(--deictic-bg);border-color:var(--deictic-accent)`;
    surface.append(field);
    const place = () => {
      const text = field.value.trim();
      field.remove();
      if (text !== '') add({ kind: 'note', at: point, text });
    };
    field.addEventListener('keydown', (k) => k.key === 'Enter' && place());
    field.addEventListener('blur', () => field.isConnected && place());
    // Now, not a frame later: the pointerdown's default is prevented, so no mousedown takes focus back.
    field.focus();
  };

  return { tools, hint };
}
