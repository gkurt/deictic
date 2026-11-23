/**
 * The tool panel: a bar of the plugins' tools, docked to an edge of the window, that its grip drags to any other.
 * It shows while a shortcut's keys are held, as the page dims to point on, and stays for as long as it's in use: a
 * tool has the page (`hold`), something goes on that its controls end (`keep`, a recording), or the pointer is on it.
 *
 * A plugin adds its controls as a group (`add`), each a button named by its `title`, with its key in
 * `aria-keyshortcuts`: the panel hears the keys, so a tool's key is its button's click. One tool has the page at a
 * time. The pointer, the panel's own, is none of them: the page is the page's.
 */
import type { Spot, ToolPanel } from '#src/index.ts';

import { div } from './dom.ts';

type Edge = 'top' | 'bottom' | 'left' | 'right';
/** Where the bar is: the edge it's docked to, and how far along it, from 0 to 1. */
interface Dock {
  edge: Edge;
  along: number;
}

const DOCK = 'deictic:tools';
const MARGIN = 12;
/** How long the panel outlasts the keys, in milliseconds: time to get the pointer to it. */
const LINGER = 600;

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const GRIP = svg(
  '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
);
const POINTER = svg('<path d="M5 3l14 7-6 2-2 6z"/>');

function storedDock(): Dock {
  try {
    const dock = JSON.parse(localStorage.getItem(DOCK) ?? 'null') as Dock | null;
    if (dock !== null && ['top', 'bottom', 'left', 'right'].includes(dock.edge) && dock.along >= 0 && dock.along <= 1) return dock;
  } catch {
    // Storage can be off, or hold something else: the default, then.
  }
  return { edge: 'bottom', along: 0.5 };
}

/** Puts the bar on its edge, laid out along it, and how far along. */
function place(bar: HTMLElement, { edge, along }: Dock): void {
  const vertical = edge === 'left' || edge === 'right';
  bar.classList.toggle('vertical', vertical);
  // Said too, for whatever reads it: the overlay's tooltip puts a tip beside a tool of a bar that runs down.
  bar.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
  const { width, height } = bar.getBoundingClientRect();
  const across = (room: number, size: number) => `${MARGIN + along * Math.max(0, room - size - MARGIN * 2)}px`;
  Object.assign(bar.style, {
    left: edge === 'left' ? `${MARGIN}px` : edge === 'right' ? `${innerWidth - width - MARGIN}px` : across(innerWidth, width),
    top: edge === 'top' ? `${MARGIN}px` : edge === 'bottom' ? `${innerHeight - height - MARGIN}px` : across(innerHeight, height),
  });
}

/** Dragging the bar by its grip, freely; let go, it docks to the nearest edge. */
function draggable(bar: HTMLElement, grip: HTMLElement, docked: (dock: Dock) => void): void {
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const start = bar.getBoundingClientRect();
    const dx = e.clientX - start.left;
    const dy = e.clientY - start.top;
    const move = (m: PointerEvent) => {
      bar.style.left = `${m.clientX - dx}px`;
      bar.style.top = `${m.clientY - dy}px`;
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      const r = bar.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const away: [Edge, number][] = [
        ['left', x],
        ['right', innerWidth - x],
        ['top', y],
        ['bottom', innerHeight - y],
      ];
      const [edge] = away.reduce((a, b) => (b[1] < a[1] ? b : a));
      const ratio = (at: number, room: number) => Math.min(1, Math.max(0, at / room));
      docked({ edge, along: edge === 'left' || edge === 'right' ? ratio(y, innerHeight) : ratio(x, innerWidth) });
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once: true });
  });
}

export interface Tools extends ToolPanel {
  /** Whether a shortcut's keys are held: the panel shows while they are. */
  point: (on: boolean) => void;
}

export interface ToolsOptions {
  /** The marked element at a point of the window, or the nearest to it, and where the point is in it. */
  spotAt: (x: number, y: number) => Spot | undefined;
  /** Whether a point of the page is being picked: what's under the pointer is lit meanwhile, as pointing lights it. */
  aim: (on: boolean) => void;
}

export function toolPanel(root: ShadowRoot, { spotAt, aim }: ToolsOptions): Tools {
  const bar = div('tool-panel');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'deictic tools');
  const grip = Object.assign(document.createElement('span'), { className: 'grip', title: 'Drag to any edge', innerHTML: GRIP });
  const pointer = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'icon',
    title: 'Pointer',
    innerHTML: POINTER,
  });
  pointer.setAttribute('aria-label', 'Pointer');
  pointer.setAttribute('aria-keyshortcuts', 'V');
  bar.append(grip, pointer);
  // After every plugin's own, whichever adds first: what takes the rest (a task).
  const last: HTMLElement[] = [];
  root.append(bar);

  let dock = storedDock();
  const replace = () => place(bar, dock);
  addEventListener('resize', replace);
  draggable(bar, grip, (next) => {
    dock = next;
    replace();
    try {
      localStorage.setItem(DOCK, JSON.stringify(dock));
    } catch {
      // Not kept, then: the next page has it at the bottom.
    }
  });

  let pointing = false;
  let over = false;
  let keeps = 0;
  // The tool that has the page, as what makes it let go.
  let holder: (() => void) | undefined;
  let leaving: ReturnType<typeof setTimeout> | undefined;
  const shown = () => bar.classList.contains('shown');
  const show = () => {
    clearTimeout(leaving);
    leaving = undefined;
    pointer.setAttribute('aria-pressed', String(holder === undefined));
    const on = pointing || over || keeps > 0 || holder !== undefined;
    if (on === shown()) return;
    if (!on) {
      // Not at once: the keys are let go on the way to it.
      leaving = setTimeout(() => bar.classList.remove('shown'), LINGER);
      return;
    }
    bar.classList.add('shown');
    // Its groups may have changed size since it was last shown.
    replace();
  };
  bar.addEventListener('pointerenter', () => {
    over = true;
    show();
  });
  bar.addEventListener('pointerleave', () => {
    over = false;
    show();
  });
  // Laid out again as its groups change: a recording's controls come and go.
  new ResizeObserver(() => shown() && replace()).observe(bar);

  const letGo = () => {
    const left = holder;
    holder = undefined;
    left?.();
    show();
  };
  pointer.addEventListener('click', letGo);

  /** The control a key is for, by its `aria-keyshortcuts`: a key alone, or with the keys it names. */
  const forKey = (e: KeyboardEvent): HTMLElement | undefined => {
    // By the letter typed, and by where the key is where it types no Latin letter (another layout, or Alt held).
    const key = /^[a-z]$/i.test(e.key) ? e.key.toUpperCase() : e.code.startsWith('Key') ? e.code.slice(3) : e.key;
    const held = [e.ctrlKey && 'Control', e.metaKey && 'Meta', e.shiftKey && 'Shift'].filter((m) => m !== false);
    for (const el of bar.querySelectorAll<HTMLElement>('[aria-keyshortcuts]')) {
      if (el instanceof HTMLButtonElement && el.disabled) continue;
      // One that isn't shown now: a recording's Stop while none is going.
      if (el.offsetParent === null) continue;
      for (const keys of (el.getAttribute('aria-keyshortcuts') ?? '').split(' ')) {
        const named = keys.split('+');
        if (named.at(-1) !== key) continue;
        const mods = named.slice(0, -1);
        // While the keys are held to point, a key alone is its tool whatever is held with it.
        if (mods.length === 0 ? pointing || held.length === 0 : mods.length === held.length && mods.every((m) => held.includes(m)))
          return el;
      }
    }
    return undefined;
  };
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.repeat || !(pointing || holder !== undefined)) return;
      const [target] = e.composedPath();
      const typing = target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable]');
      // Esc is the tool's before the popup's, from the popup's field too (a task being typed while marks are drawn):
      // only a modal's own comes first, as a note being typed drops the note.
      if (e.key === 'Escape' && holder !== undefined) {
        if (target instanceof Element && target.closest('[data-deictic-modal]') !== null) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        return letGo();
      }
      // What's typed in a field of ours is the field's (a note, a task's words). A field of the page's has its keys
      // too while they're only held to point: Alt with a letter types one there. Once a tool has the page, the page
      // isn't in use, and a field of its that still has the focus gets none.
      if (typing && (holder === undefined || target.getRootNode() === root)) return;
      const control = forKey(e);
      if (control === undefined) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      control.click();
    },
    true,
  );

  const hold: ToolPanel['hold'] = (left) => {
    letGo();
    holder = left;
    show();
    return () => {
      if (holder !== left) return;
      holder = undefined;
      show();
    };
  };

  return {
    add: (group, options) => {
      const sep = Object.assign(document.createElement('span'), { className: 'sep' });
      if (options?.last === true) {
        last.push(sep, group);
        bar.append(sep, group);
      } else if (last[0] === undefined) {
        bar.append(sep, group);
      } else {
        last[0].before(sep, group);
      }
    },
    hold,
    keep: () => {
      keeps++;
      show();
      let kept = true;
      return () => {
        if (!kept) return;
        kept = false;
        keeps--;
        show();
      };
    },
    pick: () =>
      new Promise((done) => {
        // Over the page and under the popup and the panel: it takes the pointer, so the press is no click on the page.
        const surface = div('tool-surface');
        root.append(surface);
        const end = (spot: Spot | undefined) => {
          surface.remove();
          aim(false);
          done(spot);
        };
        const release = hold(() => end(undefined));
        aim(true);
        surface.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          release();
          end(spotAt(e.clientX, e.clientY));
        });
      }),
    point: (on) => {
      pointing = on;
      show();
    },
  };
}
