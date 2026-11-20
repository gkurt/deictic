/**
 * `deictic/annotations`: mark up the page itself. Its tab is annotate
 * mode over the page: boxes, arrows, a pen and notes, drawn where the page is, so they stay with
 * it as it scrolls. They're kept for the tab's session, per page, until cleared.
 *
 * They're data other plugins build on, through `use('annotations')` in the page: screenshots draw them
 * over the page (`svg(area)`), tasks repeat their notes, and a recording can keep each change as it
 * happens (`subscribe`). Nothing of it runs on the server.
 */
import { definePlugin, type Shortcut } from '#src/index.ts';

/** A point in page coordinates: CSS pixels from the document's top left, so it stays put as the page scrolls. */
export interface Point {
  x: number;
  y: number;
}

/** A rectangle: in page coordinates for a shape, in viewport coordinates for an area to draw. */
export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Shape =
  | ({ kind: 'box' } & Area)
  | { kind: 'arrow'; from: Point; to: Point }
  | { kind: 'pen'; points: Point[] }
  | { kind: 'note'; at: Point; text: string };

export interface Annotation {
  id: string;
  color: string;
  shape: Shape;
  /** When it was made, as `Date.now()`. */
  at: number;
}

/** A change, as `subscribe` hears it: what a recording keeps, to show the marks as they were made. */
export type AnnotationEvent = { type: 'add'; annotation: Annotation } | { type: 'remove'; id: string } | { type: 'clear' };

/** The page's half, for other plugins' page halves. */
export interface Annotations {
  /** Every annotation on this page, oldest first. */
  list(): Annotation[];
  add(shape: Shape, color?: string): Annotation;
  remove(id: string): void;
  clear(): void;
  /** Hears every change from now on; answers what stops it. */
  subscribe(listener: (event: AnnotationEvent) => void): () => void;
  /**
   * The annotations over a part of the viewport, in viewport CSS pixels, as an SVG that size: what a
   * screenshot of that area draws over it. Nothing when there are none.
   */
  svg(area: Area): string | undefined;
  /**
   * Opens a picture (a screenshot, most often) over everything, with the toolbar, to draw on: answers the
   * marks, in the picture's CSS pixels, on Save, and nothing on Cancel, Esc or `signal`. It starts from
   * `marks`, to edit them again. They're the picture's alone, not the page's.
   */
  edit(picture: Picture, marks?: readonly Annotation[], options?: { signal?: AbortSignal }): Promise<Annotation[] | undefined>;
  /** The picture with the marks drawn over it, as a PNG at the picture's own resolution. */
  flatten(picture: Picture, marks: readonly Annotation[]): Promise<Blob>;
  /**
   * Annotate mode's tools, for another plugin's UI to show (a recording's toolbar): a pointer tool, picked
   * to start with, leaves the page usable; while a drawing tool is picked, the page is drawn on. What's
   * drawn is its own `marks`, not the page's: shown while it's open, kept by nothing, gone on `close`.
   */
  tools(): { element: HTMLElement; marks: MarkSet; close: () => void };
}

/** A set of marks on the page: the page's own, kept for the session, or a toolbar's, kept by nothing. */
export type MarkSet = Pick<Annotations, 'list' | 'add' | 'remove' | 'clear' | 'subscribe' | 'svg'>;

/** An image to draw on: where it loads from (the page's origin, so a canvas may read it), and its size in CSS pixels, which marks on it are in. */
export interface Picture {
  url: string;
  width: number;
  height: number;
}

declare module 'deictic' {
  interface ClientApis {
    annotations: Annotations;
  }
}

export interface AnnotationsOptions {
  /** What opens its tab directly, beside deictic's own shortcut, which opens any: none by default. */
  shortcut?: Shortcut;
  /** The colour marks are drawn in: a red that deictic's own green isn't. */
  color?: string;
}

export function annotations(options: AnnotationsOptions = {}) {
  return definePlugin({
    name: 'annotations',
    client: 'deictic/annotations/client',
    shortcut: options.shortcut,
    clientOptions: { color: options.color ?? '#ef4444' },
  });
}

export default annotations;
