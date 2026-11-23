/**
 * The drawer: on the window's side, where what the plugins have for the page lands, a section each (the
 * tasks still to do, the shots and recordings no task has taken). It shows while a shortcut's keys are held, as the
 * tool panel does, and only while a section has something in it; it stays while the pointer is on it, while something
 * goes on in it (`keep`), and while one of its items is open.
 *
 * An item opens in the drawer itself (`show`): its view takes the sections' place, with a way back. Esc is the view's
 * while the focus is in the drawer, or no popup is open to have it first.
 *
 * It folds away to a pill, by the button in its corner, and stays so (`localStorage`) until the pill is pressed or an
 * item opens in it. The pill counts what the sections have (`data-count`), or what's unread there (`data-unread`).
 */
import type { ClientContext, Drawer, TrayItem } from '#src/index.ts';

import { div } from './dom.ts';

/** How long the drawer outlasts the keys, in milliseconds: time to get the pointer to it. */
const LINGER = 600;
/** Where whether it's folded is kept. */
const FOLDED = 'deictic:drawer';
const FOLD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
const TRAY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13l2.5-8h11l2.5 8v6H4zM4 13h5l1 2h4l1-2h5"/></svg>';
const BACK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

/** A play mark, for a row that plays something: drawn, as a system's own differs from one to the next. */
export function playMark(): HTMLElement {
  const mark = document.createElement('span');
  mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>';
  return mark;
}

export interface OwnDrawer extends Drawer {
  /** Whether a shortcut's keys are held: the drawer shows while they are. */
  point: (on: boolean) => void;
}

export interface DrawerOptions {
  /** Whether the tool panel is on the window's right: the drawer is then on its left, out from under it. */
  crowded: () => boolean;
}

export function drawerIn(root: ShadowRoot, { crowded }: DrawerOptions): OwnDrawer {
  const drawer = div('drawer');
  drawer.setAttribute('role', 'complementary');
  drawer.setAttribute('aria-label', 'deictic drawer');
  const sections = div('drawer-sections');
  const viewing = div('drawer-view');
  viewing.hidden = true;
  const fold = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'icon drawer-fold',
    title: 'Fold the drawer away',
    innerHTML: FOLD,
  });
  const pill = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'drawer-pill',
    title: 'Open the drawer',
    innerHTML: TRAY,
  });
  const count = document.createElement('span');
  pill.append(count);
  drawer.append(fold, pill, sections, viewing);
  root.append(drawer);

  let folded = false;
  try {
    folded = localStorage.getItem(FOLDED) === 'folded';
  } catch {
    // Storage can be off: open, then.
  }
  const foldTo = (on: boolean) => {
    folded = on;
    drawer.classList.toggle('folded', on);
    try {
      localStorage.setItem(FOLDED, on ? 'folded' : 'open');
    } catch {
      // Not kept past the page, then.
    }
  };
  drawer.classList.toggle('folded', folded);
  fold.addEventListener('click', () => foldTo(true));
  pill.addEventListener('click', () => foldTo(false));
  /** What the pill says: how much the sections shown have, or how much of it is unread, in the overlay's green. */
  const counted = () => {
    const shown = [...sections.children].filter((section) => !section.hasAttribute('hidden')) as HTMLElement[];
    // A section that says nothing, or something that isn't a number, counts none.
    const sum = (key: 'count' | 'unread') =>
      shown.reduce((n, section) => {
        const said = Number(section.dataset[key] ?? 0);
        return n + (Number.isFinite(said) ? said : 0);
      }, 0);
    const unread = sum('unread');
    count.textContent = String(unread > 0 ? unread : sum('count'));
    pill.classList.toggle('news', unread > 0);
    pill.title = unread > 0 ? `Open the drawer: ${unread} unread` : 'Open the drawer';
  };

  let pointing = false;
  let over = false;
  let keeps = 0;
  // What closes the item that's open, where one is.
  let leave: (() => void) | undefined;
  let leaving: ReturnType<typeof setTimeout> | undefined;
  const shown = () => drawer.classList.contains('shown');
  // A section with nothing to show hides itself: the drawer has nothing then, and stays away.
  const empty = () => leave === undefined && ![...sections.children].some((section) => !section.hasAttribute('hidden'));
  const show = () => {
    clearTimeout(leaving);
    leaving = undefined;
    const on = !empty() && (pointing || over || keeps > 0 || leave !== undefined || drawer.contains(root.activeElement));
    if (on === shown()) return;
    // Emptied, it goes at once, not shrunk to its corner's button for a while: nothing is left to get the pointer to.
    if (!on && empty()) {
      drawer.classList.add('emptied');
      drawer.classList.remove('shown');
      return;
    }
    drawer.classList.remove('emptied');
    if (!on) {
      // Not at once: the keys are let go on the way to it.
      leaving = setTimeout(() => drawer.classList.remove('shown'), LINGER);
      return;
    }
    drawer.classList.toggle('left', crowded());
    drawer.classList.add('shown');
  };
  drawer.addEventListener('pointerenter', () => {
    over = true;
    show();
  });
  drawer.addEventListener('pointerleave', () => {
    over = false;
    show();
  });
  drawer.addEventListener('focusout', () => queueMicrotask(show));
  // A section fills as its plugin reads what it has: the drawer is there once one does.
  new MutationObserver(() => {
    counted();
    show();
  }).observe(sections, { subtree: true, attributes: true, attributeFilter: ['hidden', 'data-count', 'data-unread'] });

  const close = () => {
    const closed = leave;
    if (closed === undefined) return;
    leave = undefined;
    viewing.replaceChildren();
    viewing.hidden = true;
    sections.hidden = false;
    closed();
    show();
  };
  // Before the popup's own Esc, which is added as a popup opens: the item's while it's typed in, or with no popup.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || leave === undefined || root.querySelector('[data-deictic-modal]') !== null) return;
      if (!drawer.contains(root.activeElement) && root.querySelector('.panel') !== null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    },
    true,
  );

  return {
    add: (section, options) => {
      section.classList.add('drawer-section');
      if (options?.first === true) sections.prepend(section);
      else sections.append(section);
      counted();
      show();
    },
    show: (view, { title = '', closed = () => {} } = {}) => {
      close();
      const back = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'icon',
        title: 'Back to the list',
        innerHTML: BACK,
      });
      back.setAttribute('aria-keyshortcuts', 'Escape');
      back.addEventListener('click', close);
      const head = div('drawer-head');
      head.append(back, Object.assign(document.createElement('span'), { className: 'drawer-title', textContent: title }));
      viewing.replaceChildren(head, view);
      sections.hidden = true;
      viewing.hidden = false;
      leave = closed;
      // Something asked to be seen: folded away, it couldn't be.
      if (folded) foldTo(false);
      show();
      return () => {
        if (leave === closed) close();
      };
    },
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
    point: (on) => {
      pointing = on;
      show();
    },
  };
}

/**
 * A section of what a plugin's tools made and no task has taken, from the tray: a heading and a row each, which
 * opens it; its × takes it out of the tray. Away while there are none.
 */
export function trayed(
  { tray }: Pick<ClientContext, 'tray'>,
  plugin: string,
  title: string,
  row: (item: TrayItem, index: number, all: TrayItem[]) => { label: (string | Node)[]; open: (from: HTMLElement) => void },
): HTMLElement {
  const section = document.createElement('section');
  const heading = Object.assign(document.createElement('h3'), { textContent: title });
  const list = div('drawer-rows');
  section.append(heading, list);
  const draw = () => {
    const items = tray.list(plugin);
    section.hidden = items.length === 0;
    section.dataset.count = String(items.length);
    list.replaceChildren(
      ...items.map((item, i) => {
        const { label, open } = row(item, i, items);
        const opener = Object.assign(document.createElement('button'), { type: 'button', className: 'drawer-open' });
        opener.append(...label);
        opener.addEventListener('click', () => open(el));
        const remover = Object.assign(document.createElement('button'), {
          type: 'button',
          className: 'icon',
          textContent: '×',
          title: 'Remove',
        });
        remover.addEventListener('click', () => tray.remove(plugin, item.id));
        const el = div('drawer-row');
        el.append(opener, remover);
        return el;
      }),
    );
  };
  tray.subscribe(draw);
  draw();
  return section;
}
