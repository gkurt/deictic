/**
 * `deictic/annotations`: mark up the page itself. Its tools are in the tool panel: boxes, arrows, a pen and notes,
 * drawn where the page is, so they stay with it as it scrolls. They're kept for the tab's session, per page, until
 * they're cleared or a task takes them.
 *
 * They're data other plugins build on, through `use('annotations')` in the page: screenshots draw them
 * over the page (`svg(area)`), tasks repeat their notes, and a recording can keep each change as it
 * happens (`subscribe`). Nothing of it runs on the server.
 */
import { definePlugin } from '#src/index.ts';

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
}

declare module 'deictic' {
  interface ClientApis {
    annotations: Annotations;
  }
}

export interface AnnotationsOptions {
  /** The colour marks are drawn in: a red that deictic's own green isn't. */
  color?: string;
}

export function annotations(options: AnnotationsOptions = {}) {
  return definePlugin({
    name: 'annotations',
    client: 'deictic/annotations/client',
    clientOptions: { color: options.color ?? '#ef4444' },
  });
}

export default annotations;
