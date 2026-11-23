/**
 * Annotations in the page. `setup` keeps them (in the tab's session storage, per page) and shows them in a
 * layer of deictic's overlay that lets the pointer through; it adds the tools that draw them to the tool panel,
 * and answers the API other plugins `use`.
 *
 * The layer is deictic's, so a screenshot leaves it out with the rest of the overlay and draws the marks
 * itself from `svg(area)`: one way to draw them, wherever a shot is rendered. `edit` draws on a picture
 * instead, a shot most often, with the same tools in a bar over everything, and `flatten` makes the PNG of it.
 */
import { controlFor, MOD } from '#src/client/dom.ts';
import { defineClientPlugin } from '#src/index.ts';

import { drawing, measurer } from './draw.ts';
import type { Annotation, AnnotationEvent, Annotations, Area, Picture, Point, Shape } from './index.ts';
import { type Measure, toSvg } from './svg.ts';

/** Under deictic's light and its popup, over the page. */
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
/* The tools as the tool panel has them, then Cancel and Save at its end. */
.annotations-editor .edit-bar { display: flex; align-items: center; gap: 6px; box-sizing: border-box; width: min(100%, 720px);
  padding: 6px 8px; border: 1px solid var(--deictic-line); border-radius: 12px; background: var(--deictic-bg); }
.annotations-editor .tool-group { display: flex; align-items: center; gap: 4px; margin-right: auto; }
.annotations-editor button.icon { width: 28px; height: 26px; border-radius: 6px; color: var(--deictic-fg); }
.annotations-editor button.icon svg { width: 16px; height: 16px; }
.annotations-editor button[aria-pressed='true'], .annotations-editor button[aria-pressed='true']:hover {
  color: var(--deictic-on-accent); background: var(--deictic-accent); }
.annotations-editor .edit-bar > button { padding: 3px 12px; border-radius: 6px; }
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
 * The picture over everything, to draw on: the marks on Save, nothing on Cancel, Esc or `signal`. It's a modal
 * (`data-deictic-modal`) while it's open, so Esc leaves it, not the popup under it, and the tool panel leaves the
 * keys to it: its own bar hears them, as the panel hears its own.
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
    backdrop.dataset['deicticModal'] = '';
    const bar = document.createElement('div');
    bar.className = 'edit-bar';
    bar.setAttribute('role', 'toolbar');
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
    const { group, draw } = drawing({
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
      // The picture is the tools' for as long as it's open: nothing takes it from them.
      hold: () => () => {},
    });
    draw();
    // The focus is the editor's while it's open: a field under it (the task's words) would take what's typed.
    const focused = root.activeElement;
    backdrop.tabIndex = -1;
    const end = (result: Annotation[] | undefined) => {
      backdrop.remove();
      if (focused instanceof HTMLElement) focused.focus();
      window.removeEventListener('keydown', onKey, true);
      signal?.removeEventListener('abort', cancel);
      resolve(result);
    };
    const cancel = () => end(undefined);
    const onKey = (e: KeyboardEvent) => {
      // A note being typed has its keys to itself.
      if (e.repeat || e.composedPath()[0] instanceof HTMLInputElement) return;
      const control = controlFor(bar, e);
      if (control === undefined) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      control.click();
    };
    const back = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cancel' });
    back.setAttribute('aria-keyshortcuts', 'Escape');
    back.addEventListener('click', cancel);
    const save = Object.assign(document.createElement('button'), { type: 'button', className: 'primary', textContent: 'Save' });
    save.setAttribute('aria-keyshortcuts', `${MOD}+Enter`);
    save.addEventListener('click', () => end(marks));
    bar.append(group, back, save);
    backdrop.append(Object.assign(document.createElement('style'), { textContent: EDITOR_STYLE }), bar, stage);
    root.append(backdrop);
    backdrop.focus();
    window.addEventListener('keydown', onKey, true);
    signal?.addEventListener('abort', cancel);
    show();
  });
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

/**
 * The page's marks, shown in a layer of the overlay that lets the pointer through, redrawn as it scrolls, and kept
 * in the tab's session storage under `key`.
 */
function marksOnPage(root: ShadowRoot, color: string, measure: Measure, key: string): Omit<Annotations, 'draw' | 'edit' | 'flatten'> {
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
    const measure = measurer();
    const marks = marksOnPage(root, color, measure, `deictic:annotations:${location.pathname}`);

    // Over the page, under the popup: it takes the pointer only while a tool is picked.
    const surface = fixed(LAYER + 1);
    const preview = fixed(0);
    surface.append(preview);
    root.append(surface);
    const { group, draw } = drawing({
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
    });
    tools.add(group);
    return {
      ...marks,
      draw,
      edit: (picture, start = [], { signal } = {}) => edit(root, picture, start, { color, measure, ...(signal ? { signal } : {}) }),
      flatten: (picture, drawn) => flatten(picture, drawn, measure),
    };
  },
});
