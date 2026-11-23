/**
 * The page's tasks, each pinned where its element is: what's shown of them on the page itself, beside the Task
 * tab's list of one element's. A pin is the element's outline, faint, and a badge on its corner with how many
 * tasks are still to do there, in the colour of the furthest along. They show while a shortcut's keys are held, to see
 * and no more (the pointer goes through them, to the element), and while the Task tab is open, where a pin under
 * the pointer reads its tasks and a click opens them.
 *
 * In a layer of the overlay's root, which the tab's own styles don't reach once it's closed: so its styles are its own.
 */
import { div, place, reduced } from '#src/client/dom.ts';
import type { ClientContext, Point } from '#src/index.ts';

import type { Placed } from './index.ts';

const STYLE = `
/* No box of its own, which its pins would stack in: each is under the popup, and the one pointed at over it, with its card. */
.pins { display: contents; font: 12px/1.4 system-ui, sans-serif; color: var(--deictic-fg); }
.pin { --pin: var(--deictic-accent); position: fixed; z-index: 2147483646; box-sizing: border-box; pointer-events: none; border: 1px solid color-mix(in srgb, var(--pin) 45%, transparent); border-radius: 6px; transition: border-color 0.15s, box-shadow 0.15s; }
.pin.claimed { --pin: #60a5fa; }
.pin.blocked { --pin: #fbbf24; }
.pin[hidden] { display: none; }
.pin.spot, .pin.spot:has(.pin-badge:hover, .pin-badge:focus-visible) { border: 0; box-shadow: none; }
.pin:has(.pin-badge:hover, .pin-badge:focus-visible) { z-index: 2147483647; border-color: var(--pin); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pin) 18%, transparent), 0 0 28px color-mix(in srgb, var(--pin) 45%, transparent); }
/* A drop, its point on the element's corner. */
.pin-badge {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border: 0;
  border-radius: 11px 11px 11px 3px;
  font: 700 12px/22px system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  color: #09090b;
  background: var(--pin);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pin) 22%, transparent), 0 0 18px color-mix(in srgb, var(--pin) 60%, transparent), 0 4px 12px rgb(0 0 0 / 0.4);
  pointer-events: auto;
  cursor: pointer;
}
/* While pointing they're to see: a press is the element's under them. */
.pins.passive .pin-badge { pointer-events: none; }
.pin-badge:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.pin-card {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  display: none;
  flex-direction: column;
  gap: 4px;
  width: max-content;
  max-width: 300px;
  padding: 8px 10px;
  border: 1px solid rgb(255 255 255 / 0.12);
  border-radius: 10px;
  font: 12px/1.4 system-ui, sans-serif;
  text-align: left;
  color: var(--deictic-fg);
  background: rgb(24 24 27 / 0.9);
  backdrop-filter: blur(16px) saturate(1.6);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.45);
  cursor: pointer;
}
.pin.left .pin-card { left: auto; right: 0; }
.pin.up .pin-card { top: auto; bottom: calc(100% + 8px); }
.pin-badge:hover .pin-card, .pin-badge:focus-visible .pin-card { display: flex; }
.pin-where { font: 11px ui-monospace, monospace; color: var(--deictic-muted); }
.pin-where b { color: var(--pin); }
.pin-task { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
.pin-task span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pin-task i { flex: none; align-self: center; box-sizing: border-box; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--deictic-muted); }
.pin-task i.claimed { border-color: #60a5fa; background: #60a5fa; }
.pin-task i.blocked { border-color: #fbbf24; background: #fbbf24; }
.pin-task i.waiting { border-style: dotted; }
.pin-task em { flex: none; font-style: normal; color: var(--deictic-muted); }
.pin-more { color: var(--deictic-muted); }
@media (prefers-reduced-motion: no-preference) {
  .pin { animation: deictic-pin-area 0.3s ease-out backwards; }
  .pin-badge { animation: deictic-pin 0.34s cubic-bezier(0.2, 0.9, 0.25, 1.4) backwards; animation-delay: inherit; transform-origin: 0 100%; }
}
@keyframes deictic-pin-area {
  from { opacity: 0; }
}
@keyframes deictic-pin {
  from { opacity: 0; scale: 0.2; }
}
`;

/** How long the tasks read last are shown as they are, in ms: the keys are held again and again, and each is no reason to ask the board. */
const FRESH = 4000;
/** How long the pins outlast what showed them, in ms: the popup opens a moment after the pointing that led to it ends. */
const LINGER = 200;
/** A badge's size, and how far out of the element's corner it sits, in pixels. */
const BADGE = 22;
const OUT = 10;
const EDGE = 4;
/** The tasks a pin's card names, before it only counts them. */
const NAMED = 4;
/** The states by how far along, the furthest first: a pin is the colour of its furthest. */
const ALONG = ['blocked', 'claimed', 'ready', 'waiting'];

export interface Pins {
  /** While pointing: there to see, and the pointer goes through them. Answers what takes them away. */
  glance: () => () => void;
  /**
   * While the Task tab is open on `element`: every other place's, to read under the pointer and open with a click.
   * `refresh` reads the tasks again, after a change made here.
   */
  around: (element: Element) => { refresh: () => void; release: () => void };
}

interface Pin {
  place: string;
  /** The spot in the element it's on, for a task about one: the pin is there, and has no outline. */
  at?: Point;
  el: Element;
  box: HTMLElement;
  badge: HTMLButtonElement;
  count: HTMLElement;
  card: HTMLElement;
}

const made = new WeakMap<ShadowRoot, Pins>();

/** The pins of the overlay `context` is of: one set, whoever shows it. */
export function pinsIn(context: ClientContext): Pins {
  const kept = made.get(context.root);
  if (kept !== undefined) return kept;

  let glances = 0;
  // The element the Task tab is open on, whose tasks the tab lists: it has no pin.
  let open: Element | undefined;
  let layer: HTMLElement | undefined;
  let frame = 0;
  let leaving: ReturnType<typeof setTimeout> | undefined;
  let tasks: Placed[] = [];
  let read = 0;
  let asked = 0;
  const pins = new Map<string, Pin>();
  let frames = 0;

  const elementAt = (at: string) => document.querySelector(`[data-deictic="${CSS.escape(at)}"]`);

  const pinOf = (at: string, el: Element, spot: Point | undefined): Pin => {
    const box = div('pin');
    const badge = Object.assign(document.createElement('button'), { type: 'button', className: 'pin-badge' });
    const count = document.createElement('span');
    const card = Object.assign(document.createElement('span'), { className: 'pin-card' });
    badge.append(count, card);
    box.append(badge);
    // One after another, as they come: where motion is reduced there's no animation to delay.
    if (!reduced()) box.style.animationDelay = `${Math.min(pins.size, 12) * 30}ms`;
    const pin: Pin = { place: at, ...(spot === undefined ? {} : { at: spot }), el, box, badge, count, card };
    badge.addEventListener('click', () => void context.open('tasks', pin.el, pin.at));
    return pin;
  };

  /** A pin as its tasks are now: how many, the colour of the furthest along, and its card. */
  const fill = (pin: Pin, list: Placed[]) => {
    const state = ALONG.find((s) => list.some((t) => t.state === s)) ?? 'ready';
    pin.box.className = `pin ${state}${pin.at === undefined ? '' : ' spot'}`;
    pin.count.textContent = String(list.length);
    const [, file = '', line = ''] = /^(.*):(\d+):\d+$/.exec(pin.place) ?? [];
    const tag = `<${pin.el.localName}>`;
    pin.badge.setAttribute('aria-label', `${list.length} ${list.length === 1 ? 'task' : 'tasks'} on ${tag}, line ${line}: open`);
    const where = Object.assign(document.createElement('span'), { className: 'pin-where' });
    where.append(Object.assign(document.createElement('b'), { textContent: tag }), ` ${file.split('/').at(-1)}:${line}`);
    const rows = list.slice(0, NAMED).map((t) => {
      const row = Object.assign(document.createElement('span'), { className: 'pin-task' });
      const dot = Object.assign(document.createElement('i'), { className: t.state });
      const by = t.by === undefined ? [] : [Object.assign(document.createElement('em'), { textContent: t.by })];
      row.append(dot, Object.assign(document.createElement('span'), { textContent: t.title }), ...by);
      return row;
    });
    const rest = list.length - rows.length;
    const more = rest === 0 ? [] : [Object.assign(document.createElement('span'), { className: 'pin-more', textContent: `+${rest} more` })];
    pin.card.replaceChildren(where, ...rows, ...more);
  };

  /** The pins as the tasks read last have them: one per place with an element on the page, but the open one's. */
  const draw = () => {
    if (layer === undefined) return;
    const mine = open?.getAttribute('data-deictic');
    // One for an element's tasks, and one of its own for each spot a task is about.
    const keyOf = (t: Placed) => (t.point === undefined ? t.place : `${t.place}@${t.point.x},${t.point.y}`);
    const byPlace = new Map<string, Placed[]>();
    for (const t of tasks) if (t.place !== mine) byPlace.set(keyOf(t), [...(byPlace.get(keyOf(t)) ?? []), t]);
    for (const [at, pin] of pins) {
      if (byPlace.has(at)) continue;
      pin.box.remove();
      pins.delete(at);
    }
    for (const [at, list] of byPlace) {
      let pin = pins.get(at);
      if (pin === undefined) {
        const [{ place: where, point }] = list as [Placed, ...Placed[]];
        const el = elementAt(where);
        if (el === null) continue;
        pin = pinOf(where, el, point);
        pins.set(at, pin);
        layer.append(pin.box);
      }
      fill(pin, list);
    }
    follow();
  };

  /** Each pin over its element as the page has it now: read each frame, as nothing tells of an element moving. */
  const follow = () => {
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    // An element rendered again is another: looked for now and then, not every frame.
    const look = frames++ % 20 === 0;
    for (const pin of pins.values()) {
      if (!pin.el.isConnected && look) pin.el = elementAt(pin.place) ?? pin.el;
      const whole = pin.el.getBoundingClientRect();
      // A spot's is a box of no size at the spot: nothing to outline, and the badge's point is on it.
      const r = pin.at === undefined ? whole : new DOMRect(whole.left + pin.at.x, whole.top + pin.at.y, 0, 0);
      const seen =
        pin.el.isConnected && whole.width > 0 && whole.height > 0 && r.bottom > 0 && r.top < height && r.right > 0 && r.left < width;
      pin.box.hidden = !seen;
      if (!seen) continue;
      place(pin.box, r);
      // On the top right corner, or the badge's point on the spot, and in the window where that isn't.
      const out = pin.at === undefined ? OUT : 0;
      const x = Math.max(EDGE, Math.min(r.right - out, width - EDGE - pin.badge.offsetWidth));
      const y = Math.max(EDGE, Math.min(r.top - BADGE + out, height - EDGE - BADGE));
      // From the box's padding edge, which is inside its border, where it has one.
      const edge = pin.at === undefined ? 1 : 0;
      Object.assign(pin.badge.style, { left: `${x - r.left - edge}px`, top: `${y - r.top - edge}px` });
      // Its card opens toward the middle of the window.
      pin.box.classList.toggle('left', x > width / 2);
      pin.box.classList.toggle('up', y > height / 2);
    }
  };

  /** The tasks read again, unless they were a moment ago, and drawn; as they were, where the board can't be asked. */
  const load = (again = false) => {
    draw();
    if (!again && Date.now() - read < FRESH) return;
    const ask = ++asked;
    read = Date.now();
    void context
      .request('page')
      .then(async (res) => {
        if (!res.ok || ask !== asked) return;
        ({ tasks } = (await res.json()) as { tasks: Placed[] });
        draw();
      })
      // No pins, then: the tab says why the board can't be reached, where it's opened.
      .catch(() => {});
  };

  const sync = (again = false) => {
    clearTimeout(leaving);
    if (glances === 0 && open === undefined) {
      leaving = setTimeout(() => {
        cancelAnimationFrame(frame);
        layer?.remove();
        layer = undefined;
        pins.clear();
      }, LINGER);
      return;
    }
    if (layer === undefined) {
      layer = div('pins');
      layer.append(Object.assign(document.createElement('style'), { textContent: STYLE }));
      context.root.append(layer);
      frame = requestAnimationFrame(function each() {
        frame = requestAnimationFrame(each);
        follow();
      });
    }
    layer.classList.toggle('passive', open === undefined);
    load(again);
  };

  const shown: Pins = {
    glance: () => {
      glances++;
      sync();
      return () => {
        glances--;
        sync();
      };
    },
    around: (element) => {
      open = element;
      sync();
      // After the popup, which opened since: at the same height, the later is the upper, and a pin's card is over it.
      if (layer !== undefined) context.root.append(layer);
      return {
        refresh: () => sync(true),
        release: () => {
          // Another tab's since, where the popup went on to another element: that one's to let go.
          if (open !== element) return;
          open = undefined;
          sync();
        },
      };
    },
  };
  made.set(context.root, shown);
  return shown;
}
