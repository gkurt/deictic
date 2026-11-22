/**
 * The `rrweb()` renderer's page half: a snapshot of the page's DOM with `rrweb-snapshot` (imported on the
 * first shot), masked as rrweb masks, without deictic's overlay, sent with what the server's browser needs
 * to show it as the page does: the viewport and the window around it, where it's scrolled to, the pixel density, the page's URL.
 * And which node of the snapshot the element is, so the server says where it is in what it drew.
 */

import { boxOf, screenshotsClient } from './client.ts';
import type { Snapshot, SnapshotNode } from './playwright.ts';

/** The snapshot without deictic's overlay, which rrweb has no option to leave out. */
function withoutOurs(node: SnapshotNode): SnapshotNode {
  if (!('childNodes' in node)) return node;
  const childNodes = node.childNodes.filter((c: SnapshotNode) => !('tagName' in c && c.tagName === 'deictic-overlay')).map(withoutOurs);
  return { ...node, childNodes };
}

export default screenshotsClient(async (element, { area, masking, overlay }) => {
  const { snapshot, createMirror } = await import('rrweb-snapshot').catch((e: unknown) => {
    throw new Error('the rrweb() renderer needs rrweb-snapshot: add it to your devDependencies', { cause: e });
  });
  const mirror = createMirror();
  const taken = snapshot(document, {
    mirror,
    inlineStylesheet: true,
    blockClass: masking.blockClass,
    blockSelector: masking.blockSelector ?? null,
    maskTextClass: masking.maskTextClass,
    maskTextSelector: masking.maskTextSelector ?? null,
    maskAllInputs: masking.maskAllInputs,
  });
  if (taken === null) throw new Error('screenshots: rrweb took no snapshot of this page');
  const box = boxOf(element, area);
  const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
  // Over the viewport, which the server renders before cutting out an element's part.
  const marks = overlay({ x: 0, y: 0, ...viewport });
  const body: Snapshot = {
    snapshot: withoutOurs(taken),
    ...(mirror.getId(element) === -1 ? {} : { element: mirror.getId(element) }),
    url: location.href,
    viewport,
    window: { width: innerWidth, height: innerHeight },
    ...(marks === undefined ? {} : { overlay: marks }),
    scroll: { x: scrollX, y: scrollY },
    scale: Math.min(devicePixelRatio, 2),
    // A shot of the element alone is the part of the viewport it fills.
    ...(area === 'element' ? { clip: element.getBoundingClientRect().toJSON() as Snapshot['clip'] } : {}),
  };
  return { body: JSON.stringify(body), type: 'application/json', box };
});
