/**
 * The `dom()` renderer's page half: draws the page in the page from its DOM with `modern-screenshot`
 * (imported on the first shot), so it needs no server, but text may lay out a little differently than
 * the page's. Masking changes only the copy that's drawn, never the page.
 */
import { boxOf, notOurs, screenshotsClient } from './client.ts';
import type { ResolvedMasking } from './index.ts';

const BLANK = '#d4d4d8';

const selector = (className: string, extra: string | undefined) => [`.${CSS.escape(className)}`, ...(extra ? [extra] : [])].join(', ');

/**
 * Hides in the copy what rrweb would: blocked elements become a blank box their size (the copy keeps each
 * element's size as its styles), masked text keeps its spaces but shows `*`, and so do passwords' values,
 * or every field's.
 */
function mask(copy: Node, m: ResolvedMasking): void {
  if (!(copy instanceof Element)) return;
  const all = (sel: string) => [...(copy.matches(sel) ? [copy] : []), ...copy.querySelectorAll(sel)];
  const stars = (text: string) => text.replace(/\S/g, '*');
  for (const el of all(selector(m.blockClass, m.blockSelector))) {
    el.replaceChildren();
    if (el instanceof HTMLElement || el instanceof SVGElement) el.style.background = BLANK;
  }
  for (const el of all(selector(m.maskTextClass, m.maskTextSelector))) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) text.textContent = stars(text.textContent ?? '');
  }
  for (const field of all('input, textarea')) {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) continue;
    if (!m.maskAllInputs && !(field instanceof HTMLInputElement && field.type === 'password')) continue;
    field.value = stars(field.value);
    field.setAttribute('value', field.value);
    if (field instanceof HTMLTextAreaElement) field.textContent = field.value;
  }
}

/** Draws an SVG over the whole canvas, which is the area it was made for at the canvas's scale. */
async function drawOver(canvas: HTMLCanvasElement, svg: string | undefined): Promise<HTMLCanvasElement> {
  if (svg === undefined) return canvas;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export default screenshotsClient(async (element, { area, masking, overlay }) => {
  const { domToCanvas } = await import('modern-screenshot').catch((e: unknown) => {
    throw new Error('the dom() renderer needs modern-screenshot: add it to your devDependencies', { cause: e });
  });
  // Sharp on a high-density screen, without drawing a long page at more than twice its size.
  const scale = Math.min(devicePixelRatio, 2);
  const options = { filter: notOurs, scale, onCloneNode: (copy: Node) => mask(copy, masking) };
  const box = boxOf(element, area);
  const toPng = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((done, fail) =>
      canvas.toBlob((blob) => (blob === null ? fail(new Error('screenshots: the page drew nothing')) : done(blob)), 'image/png'),
    );
  if (area === 'element') {
    const { x, y, width, height } = element.getBoundingClientRect();
    const shot = await drawOver(await domToCanvas(element, options), overlay({ x, y, width, height }));
    return { body: await toPng(shot), type: 'image/png', box };
  }

  // The whole document, then the part the viewport shows: the document's box is where it scrolled to.
  const page = await domToCanvas(document.documentElement, options);
  const { clientWidth: width, clientHeight: height } = document.documentElement;
  const at = document.documentElement.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error("screenshots: this browser won't draw to a canvas");
  ctx.drawImage(page, -at.left * scale, -at.top * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  await drawOver(canvas, overlay({ x: 0, y: 0, width, height }));
  return { body: await toPng(canvas), type: 'image/png', box };
});
