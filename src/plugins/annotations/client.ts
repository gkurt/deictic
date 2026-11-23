/**
 * Annotations in the page. `setup` keeps them (in the tab's session storage, per page) and shows them in a
 * layer of deictic's overlay that lets the pointer through; it answers the API other plugins `use`. The
 * panel is annotate mode: a toolbar, and while it's open a surface over the page that takes the pointer, so
 * drawing never clicks the page. Esc or Done leaves it; the marks stay.
 *
 * The layer is deictic's, so a screenshot leaves it out with the rest of the overlay and draws the marks
 * itself from `svg(area)`: one way to draw them, wherever a shot is rendered. `edit` draws on a picture
 * instead, a shot most often, in the same toolbar over everything, and `flatten` makes the PNG of it.
 */
import { defineClientPlugin } from '#src/index.ts';

import { button, drawing, measurer, MOD, TOOLS_STYLE } from './draw.ts';
import type { Annotation, AnnotationEvent, Annotations, Area, MarkSet, Picture, Point, Shape } from './index.ts';
import { type Measure, toSvg } from './svg.ts';

/** Under deictic's outline and panels, over the page. */
const LAYER = 2147483645;
/** Over everything of deictic's, the popup too. */
const TOP = 2147483647;

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

const EDITOR_STYLE = `
.annotations-editor:focus { outline: none; }
.annotations-editor { position: fixed; inset: 0; z-index: ${TOP}; box-sizing: border-box; padding: 16px; display: flex;
  flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: rgb(0 0 0 / 0.75);
  font: 13px/1.4 system-ui, sans-serif; color: var(--deictic-fg); }
/* A block, whatever the popup's own \`.bar\` is: its tools take its width, and Cancel and Save its end. */
.annotations-editor .bar { display: block; box-sizing: border-box; width: min(100%, 720px); padding: 6px 8px; border: 1px solid var(--deictic-line);
  border-radius: 8px; background: var(--deictic-bg); }
.annotations-editor .stage { position: relative; line-height: 0; box-shadow: 0 12px 32px rgb(0 0 0 / 0.5); touch-action: none; }
.annotations-editor img { display: block; max-width: calc(100vw - 32px); max-height: calc(100vh - 120px); user-select: none; }
.annotations-editor .marks { position: absolute; inset: 0; pointer-events: none; }
`;

/** Loads an image, decoded. */
async function image(src: string): Promise<HTMLImageElement> {
  const el = new Image();
  el.src = src;
  await el.decode();
  return el;
}

/** The marks over a whole picture, as an SVG whose view is the picture's CSS pixels. */
const over = (picture: Picture, marks: readonly Annotation[], measure?: Measure) =>
  toSvg(marks, { x: 0, y: 0, width: picture.width, height: picture.height }, { x: 0, y: 0 }, measure);

/**
 * The picture over everything, to draw on: the marks on Save, nothing on Cancel, Esc or `signal`. It holds
 * Esc while it's open (`data-deictic-modal`), so Esc leaves it, not the popup under it.
 */
function edit(
  root: ShadowRoot,
  picture: Picture,
  start: readonly Annotation[],
  { color, measure, signal }: { color: string; measure: Measure; signal?: AbortSignal },
): Promise<Annotation[] | undefined> {
  return new Promise((resolve) => {
    let marks = [...start];
    const backdrop = document.createElement('div');
    backdrop.className = 'annotations-editor';
    backdrop.dataset.deicticModal = '';
    const style = document.createElement('style');
    style.textContent = TOOLS_STYLE + EDITOR_STYLE;
    const bar = document.createElement('div');
    bar.className = 'bar';
    const stage = document.createElement('div');
    stage.className = 'stage';
    const img = Object.assign(document.createElement('img'), { src: picture.url, alt: 'The screenshot', draggable: false });
    const layer = document.createElement('div');
    layer.className = 'marks';
    stage.append(img, layer);

    const show = (preview?: Shape) => {
      layer.innerHTML = over(picture, preview === undefined ? marks : [...marks, mark(preview, color)], measure);
      // Drawn at the size the picture shows at, whatever that is: the view is the picture's own pixels.
      const svg = layer.firstElementChild;
      svg?.setAttribute('width', '100%');
      svg?.setAttribute('height', '100%');
    };
    const { tools, stop } = drawing({
      surface: stage,
      at: (e) => {
        const r = stage.getBoundingClientRect();
        return { x: ((e.clientX - r.left) * picture.width) / r.width, y: ((e.clientY - r.top) * picture.height) / r.height };
      },
      preview: (shape) => show(shape),
      add: (shape) => {
        marks = [...marks, mark(shape, color)];
        show();
      },
      removeLast: () => {
        marks = marks.slice(0, -1);
        show();
      },
      clear: () => {
        marks = [];
        show();
      },
    });
    // The focus is the editor's while it's open: a field under it (the task's words) would take what's typed.
    const focused = root.activeElement;
    backdrop.tabIndex = -1;
    const end = (result: Annotation[] | undefined) => {
      backdrop.remove();
      if (focused instanceof HTMLElement) focused.focus();
      stop();
      window.removeEventListener('keydown', onKey, true);
      signal?.removeEventListener('abort', cancel);
      resolve(result);
    };
    const cancel = () => end(undefined);
    const onKey = (e: KeyboardEvent) => {
      // A note being typed has Esc and Enter for itself.
      if (e.composedPath()[0] instanceof HTMLInputElement) return;
      const saves = e.key === 'Enter' && (e.ctrlKey || e.metaKey);
      if (e.key !== 'Escape' && !saves) return;
      e.preventDefault();
      e.stopPropagation();
      if (saves) end(marks);
      else cancel();
    };
    const save = button('Save', `${MOD}+Enter`, () => end(marks));
    save.classList.add('primary');
    const back = button('Cancel', 'Escape', cancel);
    back.classList.add('end');
    tools.append(back, save);
    bar.append(tools);
    backdrop.append(style, bar, stage);
    root.append(backdrop);
    backdrop.focus();
    window.addEventListener('keydown', onKey, true);
    signal?.addEventListener('abort', cancel);
    show();
  });
}

/**
 * Marks shown on the page, in a layer of the overlay that lets the pointer through, redrawn as it
 * scrolls. With a `key`, kept in the tab's session storage under it, per page; without, kept by nothing.
 */
function marksOnPage(root: ShadowRoot, color: string, measure: Measure, key?: string): { marks: MarkSet; remove: () => void } {
  let list = key === undefined ? [] : stored(key);
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
    if (key !== undefined) {
      try {
        sessionStorage.setItem(key, JSON.stringify(list));
      } catch {
        // Not kept past a reload, then; the page still shows them.
      }
    }
    draw();
    for (const listener of listeners) listener(event);
  };
  draw();

  const marks: MarkSet = {
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
      list = [];
      changed({ type: 'clear' });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    svg: (area) => (list.length === 0 ? undefined : toSvg(list, area, scroll(), measure)),
  };
  const remove = () => {
    window.removeEventListener('scroll', redraw, { capture: true });
    window.removeEventListener('resize', redraw);
    cancelAnimationFrame(frame);
    layer.remove();
    listeners.clear();
  };
  return { marks, remove };
}

/**
 * Drawing on the page: a surface over it, under the popup, and the toolbar. Where the page stays usable
 * (`usable`), the surface takes the pointer only while a drawing tool is picked.
 */
function onPage(root: ShadowRoot, marks: MarkSet, color: string, usable: boolean) {
  const surface = fixed(LAYER + 1);
  surface.style.pointerEvents = usable ? 'none' : 'auto';
  const preview = fixed(0);
  surface.append(preview);
  root.append(surface);
  const { tools, stop } = drawing({
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
    ...(usable ? { drawing: (on: boolean) => (surface.style.pointerEvents = on ? 'auto' : 'none') } : {}),
  });
  const close = () => {
    stop();
    surface.remove();
  };
  return { tools, close };
}

/** The picture with the marks drawn over it, as a PNG at the picture's own resolution. */
async function flatten(picture: Picture, marks: readonly Annotation[], measure: Measure): Promise<Blob> {
  const base = await image(picture.url);
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error("annotations: this browser won't draw to a canvas");
  ctx.drawImage(base, 0, 0);
  if (marks.length > 0) {
    // Shapes only, no `foreignObject`, so drawing the SVG leaves the canvas readable.
    const svg = await image(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(over(picture, marks, measure))}`);
    ctx.drawImage(svg, 0, 0, canvas.width, canvas.height);
  }
  return new Promise((done, fail) =>
    canvas.toBlob((blob) => (blob === null ? fail(new Error('annotations: the picture drew nothing')) : done(blob)), 'image/png'),
  );
}

export default defineClientPlugin<null, never, Annotations>({
  name: 'annotations',
  label: 'Annotate',
  page: true,
  setup: ({ root, options }) => {
    const color = (options as { color: string }).color;
    const measure = measurer();
    const page = marksOnPage(root, color, measure, `deictic:annotations:${location.pathname}`);

    const api: Annotations = {
      ...page.marks,
      edit: (picture, marks = [], { signal } = {}) => edit(root, picture, marks, { color, measure, ...(signal ? { signal } : {}) }),
      flatten: (picture, marks) => flatten(picture, marks, measure),
      tools: () => {
        // Its own marks, kept by nothing: they show while it's open, and go with it.
        const own = marksOnPage(root, color, measure);
        const { tools, close } = onPage(root, own.marks, color, true);
        const element = document.createElement('div');
        element.append(Object.assign(document.createElement('style'), { textContent: TOOLS_STYLE }), tools);
        return {
          element,
          marks: own.marks,
          close: () => {
            close();
            own.remove();
          },
        };
      },
    };
    return api;
  },

  mount: (panel, { root, use, close, options }) => {
    const { color } = options as { color: string };
    const marks = use('annotations');
    if (marks === undefined) return;
    const style = document.createElement('style');
    style.textContent = TOOLS_STYLE;
    // Over the page while annotate mode is open: it takes the pointer, so drawing never clicks the page.
    const { tools, close: leave } = onPage(root, marks, color, false);
    const done = button('Done', 'Escape', close);
    done.classList.add('primary', 'end');
    tools.append(done);
    panel.append(style, tools);
    return leave;
  },
});
