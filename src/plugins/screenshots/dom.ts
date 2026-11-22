/**
 * The `dom()` renderer's page half: draws the page in the page from its DOM with `modern-screenshot`
 * (imported on the first shot), so it needs no server, but text may lay out a little differently than
 * the page's. Masking changes only the copy that's drawn, never the page.
 */
import { boxOf, mask, notOurs, screenshotsClient } from './client.ts';

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
