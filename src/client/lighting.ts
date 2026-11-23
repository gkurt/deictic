/**
 * What the overlay draws on the page itself: the element under the pointer while a shortcut's keys are held, and
 * the one the popup is open on.
 *
 * It uses the whole page: it dims around the element, which stays lit in a ring, with guides from its edges across
 * the window and a caption saying what it is. The light glides from one element to the next. While the popup is
 * open the element stays lit, tied to the popup by a line that follows both. Nothing here takes the pointer, and
 * the page comes back to full light once the pointer has been out on it a moment.
 */
import type { Target } from '#src/index.ts';

import { div, nameOf, place, reduced } from './dom.ts';

/** What's pointed at while a shortcut's keys are held. */
export interface Pointed {
  /** The marked element. */
  el: Element;
  /** What's under the pointer inside it, where that differs. */
  pointed?: Element;
  target: Target;
  /**
   * The tabs that plugins' own shortcuts would open, each by its label: several where they share keys and differ by
   * button, and none for deictic's own shortcut alone.
   */
  names: string[];
  /** How many elements on the page are from its place in the source. */
  count: number;
}

export interface Lighting {
  /** Shows what's pointed at. Not `glide`: it moved with the page, which nothing eases. */
  point(at: Pointed, glide?: boolean): void;
  hide(): void;
  /** Marks the element the popup (`panel`) is open on, for as long as it is. Answers what ends it. */
  hold(element: Element, panel: HTMLElement): () => void;
}

/**
 * How far from the element its ring is, in pixels: the ring glows, and a border, an outline or a ring tried on the
 * element has to show apart from it.
 */
export const CLEAR = 8;

const grown = (r: DOMRect) => new DOMRect(r.left - CLEAR, r.top - CLEAR, r.width + 2 * CLEAR, r.height + 2 * CLEAR);

/** How long the pointer is out on the page, in milliseconds, before the page gets its light back. */
const LINGER = 700;
/** How long the light takes from one element to the next, in milliseconds: as the styles have it. */
const GLIDE = 240;
/** How far from a corner the line to the popup starts and ends, in pixels. */
const INSET = 22;

// The ring and the line, drawn as strokes: a dash can run along a stroke (the line is drawn out to the popup, and
// a light goes along it, once), which no border can. Wide faint strokes under them are the glow, as a filter over
// the whole window would be drawn again with every frame of it.
const LIT = `<svg aria-hidden="true">
<rect class="halo"/><rect class="lock"/>
<path class="halo" pathLength="1"/><path class="tether" pathLength="1"/><path class="flow" pathLength="1"/>
<circle r="3"/><circle r="3"/></svg>`;

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(n, high));

/** The light's corner for an element, as far out as the light is: a pill stays a pill, a square corner is eased a little. */
function radiusOf(el: Element, r: DOMRect): number {
  // A computed radius is a length or a percentage, and two of them where the corner is an ellipse: the first, then.
  const [first = '0px'] = getComputedStyle(el).borderTopLeftRadius.split(' ');
  const n = Number.parseFloat(first);
  const least = Math.min(r.width, r.height);
  return Math.min(first.endsWith('%') ? (n / 100) * least : n + CLEAR, least / 2);
}

/**
 * The line from the lit box to the popup: an S from side to side where the popup is beside it, else down or up to
 * it, and none where they overlap. It ends on the popup level with the box's middle, as near as the popup reaches.
 */
function tetherOf(e: DOMRect, p: DOMRect): { d: string; ends: [number, number][] } | undefined {
  for (const [near, far, low, high] of [
    ['left', 'right', 'top', 'bottom'],
    ['top', 'bottom', 'left', 'right'],
  ] as const) {
    const way = p[near] >= e[far] ? 1 : p[far] <= e[near] ? -1 : 0;
    if (way === 0) continue;
    const a1 = way > 0 ? e[far] : e[near];
    const a2 = way > 0 ? p[near] : p[far];
    const inset = (r: DOMRect) => Math.min(INSET, (r[high] - r[low]) / 2);
    const b2 = clamp((e[low] + e[high]) / 2, p[low] + inset(p), p[high] - inset(p));
    const b1 = clamp(b2, e[low] + inset(e), e[high] - inset(e));
    const bend = (a2 - a1) / 2;
    const at = (a: number, b: number): [number, number] => (near === 'left' ? [a, b] : [b, a]);
    const points = [at(a1, b1), at(a1 + bend, b1), at(a2 - bend, b2), at(a2, b2)].map(([x, y]) => `${x} ${y}`);
    return { d: `M${points[0]}C${points.slice(1).join(' ')}`, ends: [at(a1, b1), at(a2, b2)] };
  }
  return undefined;
}

export function spotlight(root: ShadowRoot): Lighting {
  // Under the marks a page keeps (annotations'), which are drawn as bright as ever.
  const veil = div('veil');
  const aim = div('aim');
  const ring = div('ring');
  const caption = div('caption');
  ring.append(caption);
  const guides = { left: div('guide gx'), right: div('guide gx'), top: div('guide gy'), bottom: div('guide gy') };
  const inner = div('inner');
  aim.append(...Object.values(guides), ring);
  root.append(veil, aim, inner);

  let pointing = false;
  let held = false;
  let said = '';
  // Not at once: a press that opens the popup hides what's pointed at and holds the same element in one go, and
  // the popup moving to another element lets one go and holds the next. The light stays on through both, and glides.
  const dark = () =>
    queueMicrotask(() => {
      if (!pointing && !held) veil.classList.remove('shown');
    });
  const light = (r: DOMRect, radius: number, glide: boolean) => {
    veil.classList.toggle('glide', glide && veil.classList.contains('shown'));
    place(veil, r);
    veil.style.borderRadius = `${radius}px`;
    veil.classList.add('shown');
  };
  const part = (className: string, text: string) => Object.assign(document.createElement('span'), { className, textContent: text });

  return {
    point({ el, pointed, target, names, count }, glide = true) {
      pointing = true;
      const box = el.getBoundingClientRect();
      const r = grown(box);
      const radius = radiusOf(el, r);
      aim.classList.toggle('glide', glide && aim.classList.contains('shown'));
      place(ring, r);
      ring.style.borderRadius = `${radius}px`;
      guides.left.style.translate = `${r.left}px`;
      guides.right.style.translate = `${r.right - 1}px`;
      guides.top.style.translate = `0 ${r.top}px`;
      guides.bottom.style.translate = `0 ${r.bottom - 1}px`;
      // The popup's element keeps the light while it's open: another pointed at then has the ring alone.
      if (!held) light(r, radius, glide);
      inner.classList.toggle('shown', pointed !== undefined);
      if (pointed !== undefined) place(inner, pointed.getBoundingClientRect());

      // What it is, where it's from, how big, how many share its place, what's pointed at in it, and the tab a
      // plugin's own shortcut opens.
      const dim = [
        `${Math.round(box.width)}×${Math.round(box.height)}`,
        ...(count > 1 ? [`×${count}`] : []),
        ...(pointed === undefined ? [] : [`› ${nameOf(pointed)}`]),
      ];
      const texts = { tag: `<${target.tag}>`, from: `${target.loc.file}:${target.loc.line}`, opens: names.join(' / ') };
      const saying = JSON.stringify([texts, dim]);
      if (saying !== said) {
        said = saying;
        caption.replaceChildren(
          part('tag', texts.tag),
          part('', texts.from),
          ...dim.map((text) => part('dim', text)),
          ...(names.length === 0 ? [] : [part('opens', texts.opens)]),
        );
      }
      caption.classList.toggle('below', r.top < 40);
      // Kept in the window: a caption is longer than most of what it names.
      caption.style.translate = `${Math.min(0, document.documentElement.clientWidth - 8 - r.left - caption.offsetWidth)}px`;
      aim.classList.add('shown');
    },
    hide() {
      pointing = false;
      aim.classList.remove('shown');
      inner.classList.remove('shown');
      dark();
    },
    hold(element, panel) {
      held = true;
      const lit = div('lit');
      lit.innerHTML = LIT;
      root.append(lit);
      const rects = [...lit.querySelectorAll('rect')];
      const paths = [...lit.querySelectorAll('path')];
      const dots = [...lit.querySelectorAll('circle')];
      // A ring that leaves the element as the popup opens on it, once.
      const pulse = reduced() ? undefined : div('pulse');
      if (pulse !== undefined) {
        root.append(pulse);
        pulse.addEventListener('animationend', () => pulse.remove());
      }

      let frame = 0;
      let was: string | undefined;
      // The first place may be a glide, from the element lit before; after it the light keeps to its element as the
      // page moves it, each frame, with no easing to fall behind by.
      let first = true;
      const settled = setTimeout(() => veil.classList.remove('glide'), GLIDE);
      const follow = () => {
        frame = requestAnimationFrame(follow);
        const on = element.isConnected;
        const e = grown(element.getBoundingClientRect());
        const p = panel.getBoundingClientRect();
        const now = on ? [e.left, e.top, e.width, e.height, p.left, p.top, p.width, p.height].join() : '';
        if (now === was) return;
        was = now;
        lit.classList.toggle('shown', on);
        // An element that's not on the page has nothing to light: the page stays as it is.
        if (!on) return veil.classList.remove('shown');
        const radius = radiusOf(element, e);
        if (first) light(e, radius, true);
        else place(veil, e);
        veil.style.borderRadius = `${radius}px`;
        if (first && pulse !== undefined) {
          place(pulse, e);
          pulse.style.borderRadius = `${radius}px`;
        }
        first = false;
        for (const rect of rects) {
          for (const [name, value] of Object.entries({ x: e.left, y: e.top, width: e.width, height: e.height, rx: radius }))
            rect.setAttribute(name, String(value));
        }
        // From what of the element is in the window: one scrolled out of it is tied from the edge it left by.
        const width = document.documentElement.clientWidth;
        const height = document.documentElement.clientHeight;
        const [left, right] = [clamp(e.left, 0, width), clamp(e.right, 0, width)];
        const [top, bottom] = [clamp(e.top, 0, height), clamp(e.bottom, 0, height)];
        const tie = tetherOf(new DOMRect(left, top, right - left, bottom - top), p);
        lit.classList.toggle('tied', tie !== undefined);
        if (tie === undefined) return;
        for (const path of paths) path.setAttribute('d', tie.d);
        for (const [i, dot] of dots.entries()) {
          dot.setAttribute('cx', String(tie.ends[i]![0]));
          dot.setAttribute('cy', String(tie.ends[i]![1]));
        }
      };
      follow();

      // The page dims for what's being done in the popup, and no longer: with the pointer out on the page a
      // moment, it's the page that's looked at, and it gets its light back until the pointer is in the overlay again.
      let lift: ReturnType<typeof setTimeout> | undefined;
      const moved = (e: PointerEvent) => {
        if (!e.composedPath().includes(root.host)) {
          lift ??= setTimeout(() => veil.classList.add('lifted'), LINGER);
          return;
        }
        clearTimeout(lift);
        lift = undefined;
        veil.classList.remove('lifted');
      };
      window.addEventListener('pointermove', moved, { capture: true, passive: true });

      return () => {
        held = false;
        cancelAnimationFrame(frame);
        clearTimeout(settled);
        clearTimeout(lift);
        window.removeEventListener('pointermove', moved, true);
        lit.remove();
        pulse?.remove();
        veil.classList.remove('lifted');
        dark();
      };
    },
  };
}
