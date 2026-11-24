/**
 * The `rrweb()` renderer's server half: rebuilds a page's snapshot in a browser beside the dev server and
 * screenshots it at the page's viewport, scroll and pixel density, so text lays out as the page's does. The
 * browser is launched on the first shot and kept for the next; Playwright closes it with the process.
 *
 * The snapshot is rebuilt into a sandboxed iframe filling a blank page on the page's own origin, which
 * Playwright answers itself, so nothing asks the dev server for it: rrweb has made the snapshot's URLs
 * whole, and its stylesheets' fonts and images load from the dev server as the page's did.
 *
 * The browser is as big as the page's window, scrollbars and all, and shows its own: a media query asks the
 * window's width, and the page is laid out in what the scrollbar leaves. At the width without it, a window
 * right on a breakpoint (1024 wide, 1009 to lay out in) would render as the narrower layout. The shot is then
 * cut to the part the page is in.
 */
import { createRequire } from 'node:module';

import type { Browser } from 'playwright-core';
import type * as Rrweb from 'rrweb-snapshot';

import { CANVAS_SIZE } from './canvas.ts';
import type { Box, BrowserOptions } from './index.ts';

/** What the page sends: its snapshot and what's needed to show it as the page does. */
/** A node of an rrweb snapshot, as `snapshot()` answers it. */
export type SnapshotNode = NonNullable<ReturnType<typeof Rrweb.snapshot>>;

export interface Snapshot {
  snapshot: SnapshotNode;
  url: string;
  viewport: { width: number; height: number };
  /** The window's size, scrollbars included, where it has any: what the page's media queries ask. */
  window?: { width: number; height: number };
  scroll: { x: number; y: number };
  scale: number;
  /** The element the shot is of, as the snapshot numbers its nodes: found again in the rebuilt page, for where it is there. */
  element?: number;
  /** The part of the viewport to keep, for a shot of an element alone: where the element was in the page. */
  clip?: Box;
  /** An SVG the viewport's size, drawn over the page: the annotations, where there are any. */
  overlay?: string;
}

const HOST = '<!doctype html><html><body style="margin:0"></body></html>';

const browsers = new Map<string, Promise<Browser>>();

/** A browser by the options, launched once: the one named, or Playwright's own Chromium, then Chrome, then Edge. */
export function browserOf(options: BrowserOptions): Promise<Browser> {
  const key = JSON.stringify(options);
  const known = browsers.get(key);
  if (known !== undefined) return known;
  const launched = launch(options);
  browsers.set(key, launched);
  // A launch that failed is tried again on the next shot, after the user installs what it said to.
  launched.catch(() => browsers.delete(key));
  return launched;
}

/** Playwright hides a headless browser's scrollbars, and with them the room they take in the page. */
const SCROLLBARS = { ignoreDefaultArgs: ['--hide-scrollbars'] };

async function launch({ executablePath, channel }: BrowserOptions): Promise<Browser> {
  const { chromium } = await import('playwright-core').catch((e: unknown) => {
    throw new Error('the rrweb() renderer needs playwright-core: add it to your devDependencies', { cause: e });
  });
  if (executablePath !== undefined || channel !== undefined) return chromium.launch({ executablePath, channel, ...SCROLLBARS });
  const tried: string[] = [];
  for (const attempt of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try {
      return await chromium.launch({ ...attempt, ...SCROLLBARS });
    } catch (e) {
      tried.push(
        `${'channel' in attempt ? attempt.channel : "Playwright's Chromium"}: ${(e instanceof Error ? e.message : String(e)).split('\n', 1)[0]}`,
      );
    }
  }
  throw new Error(
    `the rrweb() renderer found no browser to render in (${tried.join('; ')}): run \`npx playwright install chromium\`, or pass rrweb({ executablePath })`,
  );
}

/** The rrweb-snapshot bundle that defines `rrwebSnapshot` in a page: its CommonJS entry is that bundle. */
const bundle = () => createRequire(import.meta.url).resolve('rrweb-snapshot');

/**
 * The PNG, and where the element is in it. That's measured in the rebuilt page, not taken from the live one: the
 * two can lay out a few pixels apart (a font that loaded differently, a panel's own scroll), and an outline drawn
 * at the live page's box would then cross the element.
 */
export async function render(input: unknown, options: BrowserOptions): Promise<{ png: Uint8Array; box?: Box }> {
  const shot = input as Snapshot;
  if (typeof shot?.url !== 'string' || typeof shot.snapshot !== 'object' || typeof shot.viewport?.width !== 'number')
    throw new Error('screenshots: that is not a snapshot the rrweb() renderer took');
  const browser = await browserOf(options);
  const context = await browser.newContext({ viewport: shot.window ?? shot.viewport, deviceScaleFactor: shot.scale });
  try {
    const page = await context.newPage();
    const host = new URL('/__deictic/plugins/screenshots/host', shot.url).href;
    await page.route(host, (route) => route.fulfill({ contentType: 'text/html', body: HOST }));
    await page.goto(host);
    await page.addScriptTag({ path: bundle() });
    // The shot, and the attribute that sizes each canvas's picture, which the page's code can't import.
    const given = { ...shot, size: CANVAS_SIZE };
    const found = await page.evaluate(async ({ snapshot, scroll, overlay, element, size }) => {
      const { rebuildIntoSandboxedIframe, createCache, createMirror } = (globalThis as unknown as { rrwebSnapshot: typeof Rrweb })
        .rrwebSnapshot;
      const mirror = createMirror();
      const { iframe } = rebuildIntoSandboxedIframe(snapshot, {
        root: document.body,
        cache: createCache(),
        mirror,
        iframeAttributes: { style: 'border:0;position:fixed;inset:0;width:100vw;height:100vh' },
      });
      const doc = iframe.contentDocument;
      if (doc === null) throw new Error('screenshots: the snapshot was rebuilt where it cannot be read');
      // By its kind: the iframe's elements aren't instances of this page's `Element`.
      const isElement = (node: Node | null): node is Element => node?.nodeType === 1;
      // rrweb rebuilds a script as a `noscript` holding SCRIPT_PLACEHOLDER, which the sandbox, running no scripts,
      // shows: hidden, as rrweb's own replayer hides it.
      const hidden = doc.createElement('style');
      hidden.textContent = 'noscript { display: none !important; }';
      doc.head.append(hidden);
      // The sandbox runs no scripts, and where scripts don't run, a canvas shows what's inside the canvas instead of
      // what was drawn on the canvas: so each canvas's picture goes inside the canvas, at the size the page laid the
      // canvas out at. rrweb's own drawing of the picture on the canvas never shows.
      for (const canvas of doc.querySelectorAll(`canvas[${size}]`)) {
        const meta = mirror.getMeta(canvas);
        const [box, inline] = (canvas.getAttribute(size) ?? '').split(' ');
        const [width, height] = (box ?? '').split('x');
        if (meta === null || !('attributes' in meta) || typeof meta.attributes.rr_dataURL !== 'string') continue;
        const picture = doc.createElement('img');
        picture.src = meta.attributes.rr_dataURL;
        // In a line as the canvas was, else the whole of the canvas's box.
        picture.style.cssText = `display:${inline === undefined ? 'block' : 'inline'};width:${width}px;height:${height}px`;
        canvas.replaceChildren(picture);
      }
      await doc.fonts.ready;
      await Promise.all([...doc.images].map((img) => img.decode().catch(() => {})));
      // At once: a page with `scroll-behavior: smooth` would glide there, and be shot on its way.
      iframe.contentWindow?.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
      // rrweb scrolled each element as it built it, before the fonts and images gave its content its height:
      // one that couldn't scroll that far yet is scrolled again now.
      for (const id of mirror.getIds()) {
        const node = mirror.getNode(id);
        const meta = node === null ? null : mirror.getMeta(node);
        if (!isElement(node) || meta === null || !('attributes' in meta)) continue;
        const { rr_scrollTop: top, rr_scrollLeft: left } = meta.attributes;
        if (typeof top !== 'number' && typeof left !== 'number') continue;
        node.scrollTo({
          top: typeof top === 'number' ? top : node.scrollTop,
          left: typeof left === 'number' ? left : node.scrollLeft,
          behavior: 'instant',
        });
      }
      const node = element === undefined ? null : mirror.getNode(element);
      // The iframe fills the page from its top left, so a box in it is one in the shot.
      const rect = isElement(node) ? node.getBoundingClientRect() : undefined;
      const box = rect === undefined ? undefined : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      if (overlay === undefined) return box;
      // Over the page and its scroll: the SVG is the viewport's, already where it scrolled to.
      const marks = document.createElement('div');
      marks.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none';
      marks.innerHTML = overlay;
      document.body.append(marks);
      return box;
    }, given);
    // Without the scrollbars: a shot is what the page is drawn in, which is what an element's box is from.
    // A shot of the element alone is cut where the element is here.
    const clip = clamp(shot.clip === undefined ? { x: 0, y: 0, ...shot.viewport } : (found ?? shot.clip), shot.viewport);
    const png = new Uint8Array(await page.screenshot({ type: 'png', ...(clip === undefined ? {} : { clip }) }));
    return { png, ...(found === undefined || shot.clip !== undefined ? {} : { box: found }) };
  } finally {
    await context.close();
  }
}

/** A box kept within the viewport: an element partly scrolled out of it shows only the part that's in. */
function clamp(box: Box, viewport: { width: number; height: number }): Box | undefined {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const width = Math.min(viewport.width, box.x + box.width) - x;
  const height = Math.min(viewport.height, box.y + box.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}
