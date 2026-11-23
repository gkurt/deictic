/**
 * The rrweb() renderer against a real browser: a page served here, snapshotted as the page half does it,
 * rendered as the server half does, and compared with the page itself. Skipped where no Chromium is found.
 */
import { afterAll, expect, test } from 'bun:test';
import { createRequire } from 'node:module';

import type { Browser, Page } from 'playwright-core';
import type * as Rrweb from 'rrweb-snapshot';

import { browserOf, render, type Snapshot } from '#src/plugins/screenshots/playwright.ts';

const browser: Browser | undefined = await browserOf({}).catch(() => undefined);
const bundle = createRequire(import.meta.url).resolve('rrweb-snapshot');

// The case the dom() renderer got wrong: monospace text that fits on one line in its box.
const server = Bun.serve({
  port: 0,
  fetch: () =>
    new Response(
      `<!doctype html><html><head><style>
        /* A page that glides where it scrolls, which a shot must not catch on its way. */
        html { scroll-behavior: smooth; }
        body { margin: 24px; font: 16px system-ui, sans-serif; }
        code { display: inline-block; padding: 8px 12px; border: 1px solid #ddd; font: 14px ui-monospace, monospace; }
        .tall { height: 1600px; }
        .panel { height: 120px; overflow: auto; }
        .panel label { display: block; margin-top: 300px; width: 120px; height: 20px; background: #0000ff; }
        /* The window is right on this breakpoint, and the page narrower by its scrollbar: it still applies. */
        @media (min-width: 640px) { h1 { margin-left: 200px; } }
      </style></head><body>
        <h1>Pricing</h1><code>npm install -D deictic</code>
        <p>Signed in as <span class="rr-mask">Ada Lovelace</span></p>
        <div class="panel"><label></label><div class="tall"></div></div>
        <div class="tall"></div><p id="below">Further down</p>
        <deictic-overlay><div style="position:fixed;inset:0;background:red"></div></deictic-overlay>
      </body></html>`,
      { headers: { 'content-type': 'text/html' } },
    ),
});
afterAll(() => server.stop());

const viewport = { width: 640, height: 480 };
// Linux's Chromium antialiases a few glyph edges differently in the iframe (23 pixels on a CI runner, none on
// Windows): allow 0.05% of the viewport, far below what a misplaced or missing element would change.
const ALLOWED = Math.round(viewport.width * viewport.height * 0.0005);

/** The page, open, with what the page half sends for it. */
async function open(): Promise<{ page: Page; snapshot: (scroll?: number, element?: string) => Promise<Snapshot> }> {
  const page = await browser!.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(server.url.href);
  await page.addScriptTag({ path: bundle });
  const snapshot = async (scroll = 0, element?: string) => {
    await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), scroll);
    // As the page half takes it: masked as rrweb masks, without deictic's overlay.
    const { taken, id } = await page.evaluate((selector) => {
      const { snapshot, createMirror } = (globalThis as unknown as { rrwebSnapshot: typeof Rrweb }).rrwebSnapshot;
      const mirror = createMirror();
      const taken = snapshot(document, { mirror, inlineStylesheet: true, maskTextClass: 'rr-mask' });
      return { taken, id: selector === undefined ? undefined : mirror.getId(document.querySelector(selector)) };
    }, element);
    const strip = (node: Snapshot['snapshot']): Snapshot['snapshot'] =>
      'childNodes' in node
        ? {
            ...node,
            childNodes: node.childNodes
              .filter((c: Snapshot['snapshot']) => !('tagName' in c && c.tagName === 'deictic-overlay'))
              .map(strip),
          }
        : node;
    // The page without its scrollbar, and the window with it, as the page half says them.
    const inside = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    }));
    return {
      snapshot: strip(taken!),
      url: server.url.href,
      viewport: inside,
      window: viewport,
      scroll: { x: 0, y: scroll },
      scale: 1,
      ...(id === undefined ? {} : { element: id }),
    };
  };
  return { page, snapshot };
}

/**
 * How many pixels differ in brightness between two PNGs of the same size, drawn in the browser. Brightness,
 * not colour: the page's own text may be smoothed with colour fringes where text in an iframe isn't, which
 * moves nothing, while a glyph or a box out of place changes brightness.
 */
async function differing(page: Page, a: Uint8Array, b: Uint8Array): Promise<number> {
  return page.evaluate(
    async ({ a, b }) => {
      const pixels = async (bytes: number[]) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [x, y] = [await pixels(a), await pixels(b)];
      if (x.length !== y.length) return -1;
      let n = 0;
      const luma = (d: Uint8ClampedArray, i: number) => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      for (let i = 0; i < x.length; i += 4) if (Math.abs(luma(x, i) - luma(y, i)) > 48) n++;
      return n;
    },
    { a: [...a], b: [...b] },
  );
}

test.skipIf(browser === undefined)(
  'renders a snapshot as the page itself shows, scrolled where it was',
  async () => {
    const { page, snapshot } = await open();
    // The masked text and the overlay differ by design: leave them out of the comparison.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.rr-mask, deictic-overlay')) el.remove();
    });
    for (const scroll of [0, 900]) {
      const shot = await snapshot(scroll);
      // The page is tall, so it has a scrollbar, which a shot leaves out.
      expect(shot.viewport.width).toBeLessThan(viewport.width);
      const live = new Uint8Array(await page.screenshot({ clip: { x: 0, y: 0, ...shot.viewport } }));
      const { png: drawn } = await render(shot, {});
      const n = await differing(page, live, drawn);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(ALLOWED);
    }
    await page.close();
  },
  30_000,
);

test.skipIf(browser === undefined)(
  'masks as rrweb does, and leaves deictic out',
  async () => {
    const { page, snapshot } = await open();
    const shot = await snapshot();
    const text = JSON.stringify(shot.snapshot);
    expect(text).toContain('*** ********');
    expect(text).not.toContain('Ada Lovelace');
    expect(text).not.toContain('deictic-overlay');
    // Rendered, the page isn't covered by the overlay's red.
    const { png } = await render(shot, {});
    const red = await page.evaluate(
      async (bytes) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        const ctx = new OffscreenCanvas(1, 1).getContext('2d')!;
        ctx.drawImage(bitmap, -5, -5);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return r! > 200 && g! < 50 && b! < 50;
      },
      [...png],
    );
    expect(red).toBe(false);
    await page.close();
  },
  30_000,
);

test.skipIf(browser === undefined)(
  'renders an element alone as the part of the viewport it fills',
  async () => {
    const { page, snapshot } = await open();
    const box = await page.evaluate(() => document.querySelector('code')!.getBoundingClientRect().toJSON() as Snapshot['clip']);
    const { png } = await render({ ...(await snapshot()), clip: box }, {});
    const size = await page.evaluate(
      async (bytes) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        return [bitmap.width, bitmap.height];
      },
      [...png],
    );
    expect(size).toEqual([Math.round(box!.width), Math.round(box!.height)]);
    await page.close();
  },
  30_000,
);

test('refuses what is not a snapshot', async () => {
  expect(render({ nope: true }, {})).rejects.toThrow('that is not a snapshot the rrweb() renderer took');
});

test.skipIf(browser === undefined)(
  'draws the overlay over the page, where the viewport shows it',
  async () => {
    const { page, snapshot } = await open();
    const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect x="300" y="300" width="40" height="40" fill="#0000ff"/></svg>`;
    const { png } = await render({ ...(await snapshot()), overlay }, {});
    const blue = await page.evaluate(
      async (bytes) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        const ctx = new OffscreenCanvas(1, 1).getContext('2d')!;
        ctx.drawImage(bitmap, -320, -320);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return r! < 30 && g! < 30 && b! > 220;
      },
      [...png],
    );
    expect(blue).toBe(true);
    await page.close();
  },
  30_000,
);

test.skipIf(browser === undefined)(
  'says where the element is in what it drew, in a panel scrolled by itself',
  async () => {
    const { page, snapshot } = await open();
    const live = await page.evaluate(() => {
      document.querySelector('.panel')!.scrollTop = 260;
      return document.querySelector('.panel label')!.getBoundingClientRect().toJSON() as NonNullable<Snapshot['clip']>;
    });
    const { png, box } = await render(await snapshot(0, '.panel label'), {});
    // The panel is scrolled in the shot as in the page, so the element is where the page had it.
    expect(box).toEqual({ x: live.x, y: live.y, width: live.width, height: live.height });
    // And that's where it's drawn: its blue is inside the box, and not just above or below it.
    const blue = await page.evaluate(
      async ({ bytes, at }) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const is = (x: number, y: number) => {
          const [r, g, b] = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
          return r! < 30 && g! < 30 && b! > 220;
        };
        const x = at.x + at.width / 2;
        return [is(x, at.y - 2), is(x, at.y + 2), is(x, at.y + at.height - 2), is(x, at.y + at.height + 2)];
      },
      { bytes: [...png], at: box! },
    );
    expect(blue).toEqual([false, true, true, false]);
    await page.close();
  },
  30_000,
);
