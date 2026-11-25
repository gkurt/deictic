/**
 * `deictic/screenshots`: a plugin with no panel, for others to build on. In the page,
 * `use('screenshots').capture(element)` takes what the viewport shows (or the element alone), with
 * nothing of deictic's in it, and says where the element is; on the server, `use('screenshots').read(id)`
 * hands the PNG to another plugin, which the tasks plugin attaches to a task.
 *
 * How a shot is made is its renderer's: `rrweb()` by default, which snapshots the page's DOM and renders it
 * in a browser beside the dev server, so text lays out as the page's does; or `dom()`, which draws the page
 * in the page itself, for a target with no server to render on. A renderer is a page module and, where it
 * renders elsewhere, a `render` here (`Renderer`): another may take pixels from screen sharing or devtools.
 *
 * Shots are kept under `.deictic/screenshots`, the latest `keep` of them, so they outlive a
 * restart of the dev server and stay out of git.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { definePlugin } from '#src/index.ts';
import { keptIn } from '#src/tools/kept.ts';

/** A rectangle in CSS pixels, from the shot's top left. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A shot as the page knows it: its ID, where the dev server serves its PNG, and where the element is in it. */
export interface Shot {
  id: string;
  url: string;
  /** The element, in the shot: nothing marks it there, as nothing of deictic's is drawn. */
  box: Box;
  /** The shot's size in CSS pixels; its PNG may have more, on a high-density screen. */
  size: { width: number; height: number };
}

export interface CaptureOptions {
  /** `viewport`, what the page shows, by default; or `element`, the element alone. */
  area?: 'viewport' | 'element';
}

/** The page's half, for other plugins' page halves. */
export interface Capture {
  capture(element: Element, options?: CaptureOptions): Promise<Shot>;
  /** Keeps a PNG made of a shot (the same one with marks drawn over it, say) as a shot of its own. */
  upload(png: Blob, of: Pick<Shot, 'box' | 'size'>): Promise<Shot>;
  /** A copy of an element with what a shot hides hidden in it too: for a plugin that sends its HTML somewhere. */
  masked(element: Element): Element;
  /**
   * Keeps what a shot of the page now needs, to render later: the overlay calls it (through the plugin's
   * `pressed`) as a shortcut's press goes down, so a tooltip, a hover's styles or a focused menu are still there.
   * Only a renderer that can take the page at once does (`rrweb()`, once it has loaded); the last press's is kept.
   */
  freeze(element: Element): void;
  /**
   * The shot of the page as the last press on `element` froze it, rendered on the first ask, or nothing where the
   * last press was on another element or nothing was frozen: then `capture` takes the page as it is now.
   */
  frozen(element: Element): Promise<Shot> | undefined;
}

/** The server's half, for other plugins' server halves. */
export interface Screenshots {
  /** A shot's PNG, or nothing for one not kept (any more). */
  read(id: string): { data: Uint8Array<ArrayBuffer>; name: string; type: 'image/png' } | undefined;
}

declare module 'deictic' {
  interface ServerApis {
    screenshots: Screenshots;
  }
  interface ClientApis {
    screenshots: Capture;
  }
}

/**
 * What a shot hides, as rrweb names it and by its defaults, so one marking in the app hides the same
 * things from a screenshot as from an rrweb recording or snapshot.
 */
export interface Masking {
  /** Elements drawn as a blank box their size: `rr-block` by default. */
  blockClass?: string;
  blockSelector?: string;
  /** Elements whose text is drawn as `*`: `rr-mask` by default. */
  maskTextClass?: string;
  maskTextSelector?: string;
  /** Every field's value as `*`, not only passwords': false by default. */
  maskAllInputs?: boolean;
}

/** Masking with its defaults, as a renderer's page half gets it. */
export type ResolvedMasking = Required<Pick<Masking, 'blockClass' | 'maskTextClass' | 'maskAllInputs'>> & Masking;

/**
 * How shots are made. `client` is the page module that captures, default-exporting `screenshotsClient(…)`
 * from `deictic/screenshots/client`. A page half that sends a PNG needs nothing here; one that sends
 * something else, as JSON (a DOM snapshot), needs `render` to make the PNG of it.
 */
export interface Renderer {
  client: string;
  /** What the page half gets, besides the masking. */
  clientOptions?: unknown;
  /** The packages it imports that the project installs, as a plugin's `packages`. */
  packages?: string[];
  /** The PNG, or with it the element's `box` in it, where it's not where the page said (the page was drawn again elsewhere). */
  render?(input: unknown): Promise<Uint8Array | { png: Uint8Array; box?: Box }>;
}

/** Where `rrweb()` finds a browser: any Chromium renders the snapshot as the page's own would. */
export interface BrowserOptions {
  /** A Chromium-based browser's executable. */
  executablePath?: string;
  /** An installed browser by Playwright's name: `chrome`, `msedge`. By default Playwright's own Chromium, then Chrome, then Edge. */
  channel?: string;
}

/** Draws the page in the page, from its DOM (`modern-screenshot`): no server needed, but text may lay out a little differently. */
export const dom = (): Renderer => ({ client: 'deictic/screenshots/dom', packages: ['modern-screenshot'] });

/**
 * Snapshots the page's DOM in the page (`rrweb-snapshot`, masking as rrweb does) and renders it in a
 * browser beside the dev server (`playwright-core`), so text lays out as the page's does.
 */
export const rrweb = (options: BrowserOptions = {}): Renderer => ({
  client: 'deictic/screenshots/rrweb',
  packages: ['rrweb-snapshot', 'playwright-core'],
  // Loaded on the first shot, so a project rendering in the page needn't install Playwright.
  render: async (input) => (await import('./playwright.ts')).render(input, options),
});

export interface ScreenshotsOptions extends Masking {
  /** How shots are made: `rrweb()` by default, or `dom()` where there's no server to render on. */
  renderer?: Renderer;
  /** How many shots to keep, the latest: 100 by default. */
  keep?: number;
  /** Where they're kept, from the project's root: `.deictic/screenshots` by default. */
  dir?: string;
}

const ID = /^[a-z0-9]+-[a-z0-9]+$/;
/** What one PNG, or one snapshot to render, may weigh: a viewport at twice its pixels is a few MB. */
const MAX = 20 * 1024 * 1024;

export function screenshots(options: ScreenshotsOptions = {}) {
  const renderer = options.renderer ?? rrweb();
  const keep = options.keep ?? 100;
  let dir = '';
  let taken = 0;
  const pathOf = (id: string) => join(dir, `${id}.png`);
  const read: Screenshots['read'] = (id) => {
    if (!ID.test(id) || !existsSync(pathOf(id))) return undefined;
    return { data: new Uint8Array(readFileSync(pathOf(id))), name: `${id}.png`, type: 'image/png' };
  };
  const keepShot = (data: Uint8Array) => {
    // Sorts by when it was taken, which is what pruning keeps by: the count orders two in one millisecond.
    const id = `${Date.now().toString(36).padStart(9, '0')}${(taken++ % 1296).toString(36).padStart(2, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(pathOf(id), data);
    const kept = readdirSync(dir)
      .filter((f) => f.endsWith('.png'))
      .toSorted();
    for (const old of kept.slice(0, Math.max(0, kept.length - keep))) rmSync(join(dir, old));
    return id;
  };

  return definePlugin<never, never, never, Screenshots>({
    name: 'screenshots',
    client: renderer.client,
    packages: renderer.packages,
    clientOptions: {
      masking: {
        blockClass: options.blockClass ?? 'rr-block',
        blockSelector: options.blockSelector,
        maskTextClass: options.maskTextClass ?? 'rr-mask',
        maskTextSelector: options.maskTextSelector,
        maskAllInputs: options.maskAllInputs ?? false,
      } satisfies ResolvedMasking,
      renderer: renderer.clientOptions,
    },
    setup: ({ root }) => {
      dir = options.dir === undefined ? keptIn(root, 'screenshots') : resolve(root, options.dir);
      return { read };
    },
    routes: {
      // A PNG the page made, or what the renderer makes one of.
      add: async (req) => {
        const type = req.headers.get('content-type') ?? '';
        const body = new Uint8Array(await req.arrayBuffer());
        if (body.byteLength > MAX) return Response.json({ problem: `a shot may weigh ${MAX / 1024 / 1024} MB at most` }, { status: 413 });
        if (type === 'image/png') return Response.json({ id: keepShot(body) });
        if (renderer.render === undefined || !type.startsWith('application/json'))
          return Response.json({ problem: 'send the shot as image/png' }, { status: 415 });
        try {
          const made = await renderer.render(JSON.parse(new TextDecoder().decode(body)));
          if (made instanceof Uint8Array) return Response.json({ id: keepShot(made) });
          return Response.json({ id: keepShot(made.png), ...(made.box === undefined ? {} : { box: made.box }) });
        } catch (e) {
          return Response.json({ problem: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
      // `shot/<id>`: the PNG, for a panel to show.
      shot: (req) => {
        const shot = read(new URL(req.url).pathname.split('/').at(-1) ?? '');
        if (shot === undefined) return new Response('no such shot, or not kept any more', { status: 404 });
        return new Response(shot.data, { headers: { 'content-type': shot.type, 'cache-control': 'no-store' } });
      },
    },
  });
}

export default screenshots;
