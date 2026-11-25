/**
 * The `rrweb()` renderer's page half: a snapshot of the page's DOM with `rrweb-snapshot` (imported as the page
 * starts), masked as rrweb masks, without deictic's overlay, sent with what the server's browser needs
 * to show it as the page does: the viewport and the window around it, where it's scrolled to, the pixel density, the page's URL.
 * And which node of the snapshot the element is, so the server says where it is in what it drew, and which match
 * `:hover` and `:focus` and the like, which a copy of the DOM has no state for and the server gives them again.
 *
 * It takes the page at once, so a press can freeze it (`PageFreeze`): rrweb-snapshot is imported once the page has
 * started, while the browser is idle, and a press before it has loaded is taken as the task goes, as without.
 */
import type * as RrwebSnapshot from 'rrweb-snapshot';

import { CANVAS_SIZE, keepWebGLDrawing } from './canvas.ts';
import { boxOf, type PageCapture, type PageFreeze, screenshotsClient } from './client.ts';
import type { Snapshot, SnapshotNode } from './playwright.ts';
import { statesOf } from './states.ts';

type Rrweb = typeof RrwebSnapshot;

// As the page loads, before the page makes its canvases.
keepWebGLDrawing();

/** The snapshot without deictic's overlay, which rrweb has no option to leave out. */
function withoutOurs(node: SnapshotNode): SnapshotNode {
  if (!('childNodes' in node)) return node;
  const childNodes = node.childNodes.filter((c: SnapshotNode) => !('tagName' in c && c.tagName === 'deictic-overlay')).map(withoutOurs);
  return { ...node, childNodes };
}

let loading: Promise<Rrweb> | undefined;
let loaded: Rrweb | undefined;
const load = () =>
  (loading ??= import('rrweb-snapshot').then(
    (module) => (loaded = module),
    (e: unknown) => {
      loading = undefined;
      throw new Error('the rrweb() renderer needs rrweb-snapshot: add it to your devDependencies', { cause: e });
    },
  ));

/** The page now, at once: what the server renders. */
function take(rrweb: Rrweb, element: Element, { area, masking, overlay }: Parameters<PageCapture>[1]) {
  const { snapshot, createMirror } = rrweb;
  const mirror = createMirror();
  const taken = snapshot(document, {
    mirror,
    inlineStylesheet: true,
    // A canvas as a picture of what it shows, which the server draws on the canvas it rebuilds.
    recordCanvas: true,
    blockClass: masking.blockClass,
    blockSelector: masking.blockSelector ?? null,
    maskTextClass: masking.maskTextClass,
    maskTextSelector: masking.maskTextSelector ?? null,
    maskAllInputs: masking.maskAllInputs,
  });
  if (taken === null) throw new Error('screenshots: rrweb took no snapshot of this page');
  // Each canvas's size as the page lays it out, and whether in a line, as which the server shows the canvas's picture.
  for (const canvas of document.querySelectorAll('canvas')) {
    const node = mirror.getMeta(canvas);
    if (node === null || !('attributes' in node) || typeof node.attributes.rr_dataURL !== 'string') continue;
    const inline = getComputedStyle(canvas).display === 'inline';
    node.attributes[CANVAS_SIZE] = `${canvas.offsetWidth}x${canvas.offsetHeight}${inline ? ' inline' : ''}`;
  }
  const box = boxOf(element, area);
  const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
  // Over the viewport, which the server renders before cutting out an element's part.
  const marks = overlay({ x: 0, y: 0, ...viewport });
  const states = statesOf((el) => mirror.getId(el));
  const body: Snapshot = {
    snapshot: withoutOurs(taken),
    ...(mirror.getId(element) === -1 ? {} : { element: mirror.getId(element) }),
    url: location.href,
    viewport,
    window: { width: innerWidth, height: innerHeight },
    ...(marks === undefined ? {} : { overlay: marks }),
    ...(Object.keys(states).length === 0 ? {} : { states }),
    scroll: { x: scrollX, y: scrollY },
    scale: Math.min(devicePixelRatio, 2),
    // A shot of the element alone is the part of the viewport it fills.
    ...(area === 'element' ? { clip: element.getBoundingClientRect().toJSON() as Snapshot['clip'] } : {}),
  };
  return { body: JSON.stringify(body), type: 'application/json', box };
}

const freezer: PageFreeze = {
  // Not in a frame: a press is now, before the page's own handlers change it. A WebGL canvas shows what it drew,
  // as `keepWebGLDrawing` has it keep its buffer.
  freeze: (element, options) => (loaded === undefined ? undefined : take(loaded, element, options)),
  prepare: () => void load().catch(() => {}),
};

export default screenshotsClient(async (element, options) => {
  const rrweb = await load();
  // In a frame, after the page drew in it: a WebGL canvas reads back blank once its frame is shown, unless the page
  // keeps its drawing buffer, and the page's own callbacks for the frame were asked for before this one.
  await new Promise((done) => requestAnimationFrame(done));
  return take(rrweb, element, options);
}, freezer);
