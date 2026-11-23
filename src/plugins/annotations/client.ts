/**
 * Annotations in the page. `setup` keeps them (in the tab's session storage, per page), shows them in a layer of
 * deictic's overlay that lets the pointer through, and answers the API other plugins `use`. Its tools are in the
 * tool panel: while one is picked, a surface over the page takes the pointer, so drawing never clicks the page.
 * The marks stay until they're cleared, or a task takes them.
 *
 * The layer is deictic's, so a screenshot leaves it out with the rest of the overlay and draws the marks
 * itself from `svg(area)`: one way to draw them, wherever a shot is rendered.
 */
import { defineClientPlugin } from '#src/index.ts';

import { drawing, measurer } from './draw.ts';
import type { Annotation, AnnotationEvent, Annotations, Area, Point, Shape } from './index.ts';
import { type Measure, toSvg } from './svg.ts';

/** Under deictic's light and its popup, over the page. */
const LAYER = 2147483645;

const scroll = (): Point => ({ x: scrollX, y: scrollY });
const viewport = (): Area => ({ x: 0, y: 0, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight });
const mark = (shape: Shape, color: string): Annotation => ({ id: crypto.randomUUID(), color, shape, at: Date.now() });

/** What's kept for this page in the tab's session, read as it can be. */
function stored(key: string): Annotation[] {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    return Array.isArray(kept) ? (kept as Annotation[]) : [];
  } catch {
    // Storage can be off, or hold something else: no marks is the page as it was.
    return [];
  }
}

function fixed(z: number): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;z-index:${z};pointer-events:none`;
  return el;
}

/**
 * The page's marks, shown in a layer of the overlay that lets the pointer through, redrawn as it scrolls, and kept
 * in the tab's session storage under `key`.
 */
function marksOnPage(root: ShadowRoot, color: string, measure: Measure, key: string): Annotations {
  let list = stored(key);
  const listeners = new Set<(event: AnnotationEvent) => void>();
  const layer = fixed(LAYER);
  root.append(layer);

  let frame = 0;
  const draw = () => {
    frame = 0;
    layer.innerHTML = list.length === 0 ? '' : toSvg(list, viewport(), scroll(), measure);
  };
  const redraw = () => {
    if (frame === 0) frame = requestAnimationFrame(draw);
  };
  window.addEventListener('scroll', redraw, { capture: true, passive: true });
  window.addEventListener('resize', redraw, { passive: true });
  const changed = (event: AnnotationEvent) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(list));
    } catch {
      // Not kept past a reload, then; the page still shows them.
    }
    draw();
    for (const listener of listeners) listener(event);
  };
  draw();

  return {
    list: () => [...list],
    add: (shape, given = color) => {
      const annotation = mark(shape, given);
      list = [...list, annotation];
      changed({ type: 'add', annotation });
      return annotation;
    },
    remove: (id) => {
      list = list.filter((a) => a.id !== id);
      changed({ type: 'remove', id });
    },
    clear: () => {
      if (list.length === 0) return;
      list = [];
      changed({ type: 'clear' });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    svg: (area) => (list.length === 0 ? undefined : toSvg(list, area, scroll(), measure)),
  };
}

export default defineClientPlugin<never, never, Annotations>({
  name: 'annotations',
  setup: ({ root, options, tools }) => {
    const color = (options as { color: string }).color;
    const marks = marksOnPage(root, color, measurer(), `deictic:annotations:${location.pathname}`);

    // Over the page, under the popup: it takes the pointer only while a tool is picked.
    const surface = fixed(LAYER + 1);
    const preview = fixed(0);
    surface.append(preview);
    root.append(surface);
    tools.add(
      drawing({
        surface,
        at: (e) => ({ x: e.clientX + scrollX, y: e.clientY + scrollY }),
        preview: (shape) => {
          preview.innerHTML = shape === undefined ? '' : toSvg([mark(shape, color)], viewport(), scroll());
        },
        add: (shape) => marks.add(shape),
        removeLast: () => {
          const last = marks.list().at(-1);
          if (last !== undefined) marks.remove(last.id);
        },
        clear: () => marks.clear(),
        hold: tools.hold,
      }),
    );
    return marks;
  },
});
