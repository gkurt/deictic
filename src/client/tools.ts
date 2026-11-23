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

import { controlFor, div } from './dom.ts';

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
  /** The edge of the window it's docked to. */
  edge: () => Edge;
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
  // Each plugin's group as it was added: where each goes is worked out from all of them (`order`), as a later one
  // may belong before an earlier one.
  const added: { group: HTMLElement; section?: string; last: boolean }[] = [];
  /**
   * The groups in their places: those of no section, then each section (in the order its first group came, its groups
   * side by side), then those of none that asked to be `last`. Within a section, its `last` ones are at its end. A
   * line between each.
   */
  const order = () => {
    const plain = added.filter((a) => a.section === undefined);
    const sections = [...new Set(added.flatMap((a) => a.section ?? []))].map((name) => {
      const of = added.filter((a) => a.section === name);
      // Named on each, for a plugin's styles to tell its section's other groups by (a recording hides them).
      for (const a of of) a.group.dataset.section = name;
      return [...of.filter((a) => !a.last), ...of.filter((a) => a.last)].map((a) => a.group);
    });
    const blocks = [
      ...plain.filter((a) => !a.last).map((a) => [a.group]),
      ...sections,
      ...plain.filter((a) => a.last).map((a) => [a.group]),
    ];
    for (const sep of bar.querySelectorAll(':scope > .sep')) sep.remove();
    for (const block of blocks) bar.append(Object.assign(document.createElement('span'), { className: 'sep' }), ...block);
  };
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

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.repeat || !(pointing || holder !== undefined)) return;
      // A modal of ours has the keys while it's there: a note being typed, a picture drawn on, the lightbox.
      if (root.querySelector('[data-deictic-modal]') !== null) return;
      const [target] = e.composedPath();
      const typing = target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable]');
      // Esc is the tool's before the popup's, from the popup's field too (a task being typed while marks are drawn).
      if (e.key === 'Escape' && holder !== undefined) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return letGo();
      }
      // What's typed in a field of ours is the field's (a note, a task's words). A field of the page's has its keys
      // too while they're only held to point: Alt with a letter types one there. Once a tool has the page, the page
      // isn't in use, and a field of its that still has the focus gets none.
      if (typing && (holder === undefined || target.getRootNode() === root)) return;
      // While the keys are held to point, a key alone is its tool whatever is held with it.
      const control = controlFor(bar, e, pointing);
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
      added.push({ group, ...(options?.section === undefined ? {} : { section: options.section }), last: options?.last === true });
      order();
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
    edge: () => dock.edge,
  };
}
