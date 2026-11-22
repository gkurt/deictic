/**
 * The screenshots plugin's page half, around a renderer's capture: the renderer makes the shot (a PNG,
 * or what its server half makes one of), and this sends it to the plugin's `add` route and answers the
 * `Shot`. A renderer's page module default-exports `screenshotsClient(itsCapture)`.
 */
import { defineClientPlugin } from '#src/index.ts';
import type { Annotations } from '#src/plugins/annotations/index.ts';

import type { Box, Capture, CaptureOptions, ResolvedMasking, Shot } from './index.ts';

/**
 * What a renderer's page half makes of the element: a body for `add`, its type, and where the element is
 * in the shot. `overlay(area)` is what's drawn over the page in that part of the viewport, in viewport CSS
 * pixels, as an SVG that size, or nothing: the annotations plugin's marks, where it's loaded. The renderer
 * draws it over the shot, as deictic's own layers are left out.
 */
export type PageCapture = (
  element: Element,
  options: {
    area: NonNullable<CaptureOptions['area']>;
    masking: ResolvedMasking;
    renderer: unknown;
    overlay: (area: Box) => string | undefined;
  },
) => Promise<{ body: Blob | string; type: string; box: Box }>;

/** Leaves out deictic's own UI: the overlay with its hover outline and any open panel. */
export const notOurs = (node: Node) => !(node instanceof Element && node.localName === 'deictic-overlay');

/** The element's box, in CSS pixels from the viewport's top left, or from its own for a shot of it alone. */
export function boxOf(element: Element, area: NonNullable<CaptureOptions['area']>): Box {
  const { x, y, width, height } = element.getBoundingClientRect();
  return area === 'element' ? { x: 0, y: 0, width, height } : { x, y, width, height };
}

const BLANK = '#d4d4d8';

const selector = (className: string, extra: string | undefined) => [`.${CSS.escape(className)}`, ...(extra ? [extra] : [])].join(', ');

/**
 * Hides in a copy of the page's what rrweb would: blocked elements become a blank box their size (the copy keeps each
 * element's size as its styles), masked text keeps its spaces but shows `*`, and so do passwords' values,
 * or every field's.
 */
export function mask(copy: Node, m: ResolvedMasking): void {
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

export function screenshotsClient(capture: PageCapture) {
  return defineClientPlugin<never, never, Capture>({
    name: 'screenshots',
    setup: ({ base, request, options, use }) => {
      const { masking, renderer } = options as { masking: ResolvedMasking; renderer: unknown };
      // Asked at each shot: the annotations plugin may be set up after this one.
      const overlay = (area: Box) => {
        const marks: Annotations | undefined = use('annotations');
        return marks?.svg(area);
      };
      const add = async (body: Blob | string, type: string, { box, size }: Pick<Shot, 'box' | 'size'>): Promise<Shot> => {
        const res = await request('add', { method: 'POST', headers: { 'content-type': type }, body });
        // `url`: where the shot is, said by what keeps it with no server to serve it from (a `standalone` build).
        const { id, url, problem } = (await res.json()) as { id?: string; url?: string; problem?: string };
        if (id === undefined) throw new Error(`screenshots: ${problem ?? res.statusText}`);
        return { id, url: url ?? `${base}__deictic/plugins/screenshots/shot/${id}`, box, size };
      };
      return {
        capture: async (element, { area = 'viewport' } = {}) => {
          const { body, type, box } = await capture(element, { area, masking, renderer, overlay });
          const { clientWidth, clientHeight } = document.documentElement;
          const size = area === 'element' ? { width: box.width, height: box.height } : { width: clientWidth, height: clientHeight };
          return add(body, type, { box, size });
        },
        upload: (png, of) => add(png, 'image/png', of),
        masked: (element) => {
          const copy = element.cloneNode(true) as Element;
          mask(copy, masking);
          return copy;
        },
      };
    },
  });
}
