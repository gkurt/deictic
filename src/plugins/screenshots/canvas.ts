/** What the rrweb() renderer's two halves share about canvases, with no imports, as the page half runs in the page. */

/**
 * The attribute the page half gives each canvas with a picture: the canvas's size as the page lays it out, `WxH` in
 * CSS pixels, then ` inline` where the canvas sits in a line of text, as which the server shows the picture.
 */
export const CANVAS_SIZE = 'data-deictic-canvas-size';

/**
 * Has each WebGL canvas the page makes from here on keep what the canvas drew, where the page doesn't say: a WebGL
 * canvas otherwise reads back cleared once the canvas's frame shows, so a shot of a page that drew and went still
 * would have the canvas blank. rrweb's recorder does the same while the recorder records canvases. A page that clears
 * each frame draws the same either way. Self-contained, as the rrweb() renderer's test runs the function in a page as it is.
 */
export function keepWebGLDrawing(): void {
  if (typeof HTMLCanvasElement === 'undefined') return;
  const proto = HTMLCanvasElement.prototype;
  // The page's own `getContext`, called on each canvas as the canvas's own.
  const original: unknown = Object.getOwnPropertyDescriptor(proto, 'getContext')?.value;
  if (typeof original !== 'function') return;
  proto.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
    const given = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {};
    const webgl = type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl';
    const kept = webgl && given.preserveDrawingBuffer === undefined ? { ...given, preserveDrawingBuffer: true } : options;
    return Reflect.apply(original, this, [type, kept]) as RenderingContext | null;
  } as typeof HTMLCanvasElement.prototype.getContext;
}
