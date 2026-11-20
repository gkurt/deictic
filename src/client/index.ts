/**
 * `deictic/client`: the overlay the page loads in dev. Hold a shortcut's keys (Alt, deictic's own,
 * by default) and point: the element under the pointer that the source marked (`tools/locate.ts`) is
 * outlined, with its tag, its place and how many elements share it. Press the shortcut's button to open
 * the popup there: a tab for each plugin with a panel, at the one used last, or at a plugin's own where
 * its shortcut was pressed.
 *
 * Everything drawn sits in one shadow root, so neither the page's styles nor ours cross over. A
 * panel's undo and redo are its tab's on its element: the latest change that plugin made there.
 */
import type { ClientContext, ClientPlugin, LightboxItem, PanelContext, Resumed, Target } from '#src/index.ts';
import { gestureOf, type Shortcut } from '#src/shortcut.ts';

import { openLightbox } from './lightbox.ts';
import { STYLE } from './style.ts';
import { tooltips } from './tooltip.ts';

// For a plugin's page half that records the mic, or shows a clip: the waveforms the lightbox draws.
export { drawBars, liveWaveform, peaksOf, type Colors } from './waveform.ts';

export interface StartOptions {
  /** The dev server's base URL, ending in `/`. */
  base: string;
  /** deictic's own shortcut, checked: it opens the popup at the tab used last. None where it's turned off. */
  shortcut?: Required<Shortcut>;
  /** Each plugin with a half in the page, and its own shortcut as the bundler's plugin checked it, where it has one. */
  plugins: { plugin: ClientPlugin; shortcut?: Required<Shortcut>; options?: unknown }[];
}

type Mount = (panel: HTMLElement, context: PanelContext<unknown, unknown>) => (() => void) | void;

/** A plugin with a panel: a tab in the popup. */
interface Tab {
  plugin: ClientPlugin;
  mount: Mount;
}

const ATTRIBUTE = 'data-deictic';
/** An arrow pointing up and out: the link leaves the page for the editor. */
const OUT =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
/** Where the tab used last is kept, for deictic's own shortcut to open it again. */
const LAST = 'deictic:tab';
const STARTED = Symbol.for('deictic');

export function targetOf(el: Element): Target | undefined {
  const at = el.getAttribute(ATTRIBUTE);
  const match = at === null ? null : /^(.*):(\d+):(\d+)$/.exec(at);
  if (match === null) return undefined;
  return { loc: { file: match[1]!, line: Number(match[2]), column: Number(match[3]) }, tag: el.localName };
}

const sameAs = (el: Element) => [...document.querySelectorAll(`[${ATTRIBUTE}="${CSS.escape(el.getAttribute(ATTRIBUTE) ?? '')}"]`)];

/** The nearest marked element around `el`, out through shadow roots to their hosts. */
function markedAround(el: Element): Element | undefined {
  for (let at: Element | undefined = el; at !== undefined;) {
    const marked = at.closest(`[${ATTRIBUTE}]`);
    if (marked !== null) return marked;
    const root = at.getRootNode();
    at = root instanceof ShadowRoot ? root.host : undefined;
  }
  return undefined;
}

/** `div.panel > button.tab`: the element as a selector, the deepest classes only, for a person to tell it by. */
const nameOf = (el: Element) => `${el.localName}${[...el.classList].map((c) => `.${c}`).join('')}`;

/** What the overlay keeps once started, for `popupIn` to show the popup with. */
interface Started {
  base: string;
  contextOf: (name: string) => ClientContext;
  tabs: Tab[];
  /** Opens the popup over the page on an element, at a tab or the one used last: `openPopup`. */
  open: (element: Element, tab?: string) => boolean;
}

let started: Started | undefined;

/**
 * Opens the popup over the page on `element`, as deictic's own shortcut does: at `tab` (a plugin's name), or at the
 * tab used last. For a page that opens it from a gesture of its own, as deictic's site does on a plain click.
 * Answers whether it opened: not where no plugin has a tab, or `element` has no mark. The overlay must have started.
 */
export function openPopup(element: Element, { tab }: { tab?: string } = {}): boolean {
  if (started === undefined) throw new Error('deictic: the overlay has not started, so there is no popup to open');
  return started.open(element, tab);
}

/**
 * Shows the popup in `container`, open at a tab (`tab`, a plugin's name, or the first) on `element`, where
 * the page puts it rather than over the page: a page of the popup's states, to point at and fix, as deictic's
 * own site does. It's the real popup, its tabs and plugins working. Closing it, or a tab's `away`, opens it
 * again in place. It draws in `container`'s shadow root, made if there isn't one. Answers what removes it.
 * The overlay must have started (the dev server's client module starts it), and `element` be marked.
 */
export function popupIn(container: Element, { tab: name, element }: { tab?: string; element: Element }): () => void {
  if (started === undefined) throw new Error('deictic: the overlay has not started, so there is no popup to show');
  const target = targetOf(element);
  if (target === undefined) throw new Error(`deictic: ${nameOf(element)} has no ${ATTRIBUTE} mark to open the popup on`);
  const { base, contextOf, tabs } = started;
  // A tab shown here isn't one a person chose: the popup over the page keeps opening at theirs.
  const remember = () => {};
  const tab = tabs.find((t) => t.plugin.name === name) ?? tabs[0];
  if (tab === undefined) throw new Error('deictic: no plugin has a tab to show');
  const root = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${STYLE}:host { display: block; }`;
  root.replaceChildren(style);
  tooltips(root);
  let panel: { close: () => void } | undefined;
  let gone = false;
  const open = (at: Tab, resumed?: Resumed) => {
    panel = openPanel({
      base,
      root,
      contextOf,
      tabs,
      tab: at,
      remember,
      element,
      target,
      pinned: true,
      onClose: (shown, leaving) => {
        panel = undefined;
        // Closed by its own × or Esc: open again, as the page is there to show it. Leaving for `away` comes back by `reopen`.
        if (!gone && !leaving) open(shown);
      },
      ...(resumed === undefined ? {} : { resumed }),
      reopen: (again, _, kept) => open(again, kept),
    });
  };
  open(tab);
  return () => {
    gone = true;
    panel?.close();
    style.remove();
  };
}

/**
 * Shows the lightbox in `container`, at `at`, where the page puts it rather than over everything: as `popupIn`
 * does the popup, for a page of deictic's own states. Its items step with its arrows; there's no backdrop, close
 * or keys, and an item's actions run without closing it. Answers what removes it.
 */
export function lightboxIn(container: Element, items: LightboxItem[], { at }: { at?: number } = {}): () => void {
  const root = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${STYLE}:host { display: block; }`;
  root.replaceChildren(style);
  tooltips(root);
  const { close } = openLightbox(root, items, { ...(at === undefined ? {} : { at }), pinned: true });
  return () => {
    close();
    style.remove();
  };
}

/** Starts the overlay, once per page: the client module runs again when a module importing it is replaced. */
export function start({ base, shortcut: own, plugins: given }: StartOptions): void {
  const page = globalThis as { [STARTED]?: true };
  if (page[STARTED] === true) return;
  page[STARTED] = true;

  const host = document.createElement('deictic-overlay');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const box = div('box');
  const label = div('label');
  box.append(label);
  // What's under the pointer, outlined inside the marked element around it when they differ.
  const inner = div('box inner');
  root.append(style, box, inner);
  tooltips(root);
  document.documentElement.append(host);

  // Each plugin's API, set up before any panel opens. `use` reads it when asked, so a setup may keep
  // `use` for later, not call it: the plugin it asks for may not be set up yet.
  const apis = new Map<string, unknown>();
  const optionsOf = new Map(given.map(({ plugin, options }) => [plugin.name, options]));
  const contextOf = (name: string): ClientContext => ({
    base,
    root,
    options: optionsOf.get(name),
    use: (other) => apis.get(other) as never,
    request: (route, init) => fetch(`${base}__deictic/plugins/${name}/${route}`, init),
    open: (plugin, element) => openAt(plugin, element),
    lightbox: (items, options) => openLightbox(root, items, options),
  });
  for (const { plugin } of given) {
    if (plugin.setup === undefined) continue;
    try {
      apis.set(plugin.name, plugin.setup(contextOf(plugin.name)));
    } catch (e) {
      // One plugin's failure is no reason to take the others down with it.
      console.error(`deictic: ${plugin.name} failed to set up`, e);
    }
  }
  const tabs: Tab[] = given.flatMap(({ plugin }) => (plugin.mount === undefined ? [] : [{ plugin, mount: plugin.mount }]));
  started = { base, contextOf, tabs, open: (element, tab) => tabs.length > 0 && openAt(tab ?? last().plugin.name, element) };
  const last = () => {
    let name: string | null = null;
    try {
      name = localStorage.getItem(LAST);
    } catch {
      // Storage can be off: the first tab, then.
    }
    return tabs.find((t) => t.plugin.name === name) ?? tabs[0]!;
  };
  const remember = (tab: Tab) => {
    try {
      localStorage.setItem(LAST, tab.plugin.name);
    } catch {
      // Not kept, then: the next open starts at the first tab.
    }
  };
  // What opens the popup, and at which tab: deictic's own shortcut at the one used last, each
  // plugin's at its own.
  const plugins = [
    ...(own === undefined || tabs.length === 0 ? [] : [{ shortcut: own, gesture: gestureOf(own), tab: last }]),
    ...given.flatMap(({ plugin, shortcut }) => {
      if (shortcut === undefined) return [];
      const tab = tabs.find((t) => t.plugin === plugin);
      if (tab !== undefined) return [{ shortcut, gesture: gestureOf(shortcut), tab: () => tab }];
      console.error(`deictic: ${plugin.name} has a shortcut, but its page half has no \`mount\` to draw a tab with`);
      return [];
    }),
  ];

  let pointer: { x: number; y: number } | undefined;
  let frame = 0;
  let panel: { close: () => void } | undefined;

  /** The plugins whose keys are held: several, where they share keys and differ by button. */
  const heldBy = (e: MouseEvent | KeyboardEvent) => plugins.filter((p) => p.gesture.held(e));
  /** The plugin a press opens. */
  const pressedBy = (e: MouseEvent) => plugins.find((p) => p.gesture.held(e) && e.button === p.gesture.button);
  /**
   * The marked element at a point, and what's under the pointer inside it where that differs: down through
   * open shadow roots but the overlay's own, as a page showing the popup (`popupIn`) has it in one.
   */
  const hitAt = (x: number, y: number) => {
    let under = document.elementFromPoint(x, y) ?? undefined;
    while (under !== undefined && under !== host && under.shadowRoot !== null) {
      const inside = under.shadowRoot.elementFromPoint(x, y);
      if (inside === null || inside === under) break;
      under = inside;
    }
    const el = under === undefined || under === host ? undefined : markedAround(under);
    return el === undefined ? undefined : { el, pointed: under === el ? undefined : under };
  };
  const hide = () => {
    box.classList.remove('shown');
    inner.classList.remove('shown');
  };
  const show = (held: typeof plugins) => {
    frame = 0;
    const hit = pointer === undefined ? undefined : hitAt(pointer.x, pointer.y);
    const el = hit?.el;
    const target = el === undefined ? undefined : targetOf(el);
    if (el === undefined || target === undefined) return hide();
    place(box, el.getBoundingClientRect());
    if (hit?.pointed === undefined) {
      inner.classList.remove('shown');
    } else {
      place(inner, hit.pointed.getBoundingClientRect());
      inner.classList.add('shown');
    }
    const count = sameAs(el).length;
    // The button, where it isn't the left: what the keys alone don't tell apart.
    const names = held.map(({ tab, shortcut }) => {
      const { plugin } = tab();
      const name = plugin.label ?? plugin.name;
      return shortcut.button === 'left' ? name : `${name} (${shortcut.button})`;
    });
    const within = hit?.pointed === undefined ? '' : ` › ${nameOf(hit.pointed)}`;
    label.textContent = `${names.join(' / ')} · <${target.tag}> ${target.loc.file}:${target.loc.line}${count > 1 ? ` · ×${count}` : ''}${within}`;
    label.classList.toggle('below', el.getBoundingClientRect().top < 24);
    box.classList.add('shown');
  };
  const update = (e: MouseEvent | KeyboardEvent) => {
    const held = heldBy(e);
    if (held.length === 0) return hide();
    if (frame === 0) frame = requestAnimationFrame(() => show(held));
  };

  window.addEventListener(
    'mousemove',
    (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      update(e);
    },
    { capture: true, passive: true },
  );
  window.addEventListener('keydown', update, true);
  window.addEventListener('keyup', update, true);
  window.addEventListener('blur', hide);
  let press = {};
  let opened: object | undefined;
  // Alt-click on a link would otherwise download it, and on a field focus it.
  window.addEventListener(
    'mousedown',
    (e) => {
      press = {};
      if (e.composedPath().includes(host)) return;
      if (pressedBy(e) !== undefined && hitAt(e.clientX, e.clientY) !== undefined) e.preventDefault();
    },
    true,
  );
  // A press ends in `click`, `auxclick` or `contextmenu` by its button, and a right one in two of
  // them, in an order that varies by platform; on macOS Control-click is a left `contextmenu`. Each
  // is kept from the page, and the first opens the panel.
  const pressed = (e: MouseEvent) => {
    if (e.composedPath().includes(host)) return;
    const found = pressedBy(e);
    const hit = found === undefined ? undefined : hitAt(e.clientX, e.clientY);
    const target = hit === undefined ? undefined : targetOf(hit.el);
    if (found === undefined || hit === undefined || target === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    if (opened === press) return;
    opened = press;
    openTab(found.tab(), hit.el, target, undefined, hit.pointed);
  };
  const openTab = (tab: Tab, el: Element, target: Target, resumed?: Resumed, pointed?: Element) => {
    hide();
    panel?.close();
    panel = openPanel({
      base,
      root,
      contextOf,
      tabs,
      tab,
      remember,
      element: el,
      ...(pointed === undefined ? {} : { pointed }),
      target,
      onClose: () => (panel = undefined),
      ...(resumed === undefined ? {} : { resumed }),
      reopen: (again, element, kept) => {
        const found = element.isConnected ? element : sameAs(element)[0];
        const at = found === undefined ? undefined : targetOf(found);
        // Gone from the page while away: there's nothing to come back to.
        if (found === undefined || at === undefined)
          return console.warn('deictic: the element is no longer on the page, so the popup stays closed');
        openTab(again, found, at, kept, pointed?.isConnected === true && found === element ? pointed : undefined);
      },
    });
  };
  function openAt(name: string, given: Element): boolean {
    const tab = tabs.find((t) => t.plugin.name === name);
    const el = given.isConnected ? given : (sameAs(given)[0] ?? undefined);
    const target = el === undefined ? undefined : targetOf(el);
    if (tab === undefined || el === undefined || target === undefined) return false;
    openTab(tab, el, target);
    return true;
  }
  for (const type of ['click', 'auxclick', 'contextmenu'] as const) window.addEventListener(type, pressed, true);
}

interface PanelOptions {
  base: string;
  root: ShadowRoot;
  contextOf: (name: string) => ClientContext;
  tabs: Tab[];
  /** The tab it opens at. */
  tab: Tab;
  /** Keeps the tab shown, for deictic's own shortcut to open at next. */
  remember: (tab: Tab) => void;
  element: Element;
  /** What was under the pointer inside `element`, where that differs. */
  pointed?: Element;
  target: Target;
  /** Shown where the page put it (`popupIn`), not over the page beside the element; Esc leaves it alone. */
  pinned?: boolean;
  /** Called as it closes: the tab it showed, and whether it's leaving for a tab's `away`, to come back by `reopen`. */
  onClose: (shown: Tab, leaving: boolean) => void;
  /** What the first tab's mount gets, coming back from `away`. */
  resumed?: Resumed;
  /** Opens the popup again, at a tab on an element, coming back from `away`. */
  reopen: (tab: Tab, element: Element, resumed: Resumed) => void;
}

function openPanel({
  base,
  root,
  contextOf,
  tabs,
  tab: first,
  remember,
  element,
  pointed,
  target,
  pinned = false,
  onClose,
  resumed: coming,
  reopen,
}: PanelOptions): { close: () => void } {
  // Given to the first tab's first mount only: another tab, or a remount after an undo, starts afresh.
  let resumed = coming;
  const panel = div('panel');
  // The tabs, then the element's place and undo and redo, which are the shown tab's on this element.
  const head = div('head');
  head.setAttribute('role', 'tablist');
  const bar = div('bar');
  const where = document.createElement('a');
  where.className = 'where';
  const file = document.createElement('span');
  file.textContent = `${target.loc.file}:${target.loc.line}`;
  // An arrow out, as it leaves the page for the editor; its title is the overlay's tooltip (`tooltip.ts`).
  where.append(file);
  where.insertAdjacentHTML('beforeend', OUT);
  where.title = 'Open in editor';
  where.setAttribute('aria-label', `Open ${file.textContent} in the editor`);
  // The element's place, as a request's query names it.
  const at = { file: target.loc.file, line: String(target.loc.line), column: String(target.loc.column) };
  where.href = `${base}__deictic/open?${new URLSearchParams(at)}`;
  where.addEventListener('click', (e) => {
    e.preventDefault();
    void fetch(where.href);
  });
  const undo = button('↶', 'Undo the last change here');
  const redo = button('↷', 'Redo');
  const close = button('×', 'Close (Esc)');
  const buttons = tabs.map((tab) => {
    const el = button(tab.plugin.label ?? tab.plugin.name, '');
    el.className = 'tab';
    el.setAttribute('role', 'tab');
    el.addEventListener('click', () => show(tab));
    return { tab, el };
  });
  close.classList.add('close');
  head.append(...buttons.map((b) => b.el), close);
  bar.append(where, undo, redo);
  const body = div('body');
  body.setAttribute('role', 'tabpanel');
  const status = div('status');
  panel.append(head, bar, body, status);
  root.append(panel);
  if (pinned) panel.classList.add('pinned');
  const release = pinned ? undefined : keepInView(panel, body, element.getBoundingClientRect());

  let cleanup: (() => void) | void;
  const say = (text: string, problem = false) => {
    status.textContent = text;
    status.classList.toggle('problem', problem);
  };
  const post = async <T>(route: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${base}__deictic/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await res.json()) as T & { problem?: string };
    if (!res.ok) throw new Error(json.problem ?? res.statusText);
    return json;
  };
  const unmount = () => {
    cleanup?.();
    cleanup = undefined;
    body.replaceChildren();
  };
  // The change undone may be this tab's from before the panel opened: the panel reads its model again.
  const step = (route: 'undo' | 'redo') =>
    post<{ change: { label: string } }>(route, { plugin: current.plugin.name, target })
      .then(
        async ({ change }) => {
          await load();
          say(`${route === 'undo' ? 'Undid' : 'Redid'} ${change.label}`);
        },
        (e: unknown) => say(messageOf(e), true),
      )
      .finally(() => void steps());
  // Undo and redo as the tab's history on this element stands: off with nothing to take back or do again, else
  // saying what they would. Read as a tab shows, after each change made here, and as the pointer comes back, for a
  // change made elsewhere. One a later read overtook (another tab's) sets nothing.
  let asked = 0;
  const steps = async () => {
    const ask = ++asked;
    let history: { done: { label: string }[]; undone: { label: string }[] };
    try {
      const res = await fetch(`${base}__deictic/history?${new URLSearchParams({ plugin: current.plugin.name, ...at })}`);
      if (!res.ok || ask !== asked) return;
      history = (await res.json()) as typeof history;
    } catch {
      return;
    }
    const last = history.done.at(-1);
    const next = history.undone.at(-1);
    undo.disabled = last === undefined;
    undo.title = last === undefined ? 'Nothing to undo' : `Undo ${last.label}`;
    redo.disabled = next === undefined;
    redo.title = next === undefined ? 'Nothing to redo' : `Redo ${next.label}`;
  };
  panel.addEventListener('pointerenter', () => void steps());

  const done = (leaving = false) => {
    unmount();
    release?.();
    panel.remove();
    window.removeEventListener('keydown', onKey, true);
    onClose(current, leaving);
  };
  const onKey = (e: KeyboardEvent) => {
    // A plugin's modal over the popup (one marked `data-deictic-modal`) takes Esc for itself.
    if (e.key === 'Escape' && root.querySelector('[data-deictic-modal]') === null) done();
  };
  if (!pinned) window.addEventListener('keydown', onKey, true);
  undo.addEventListener('click', () => void step('undo'));
  redo.addEventListener('click', () => void step('redo'));
  close.addEventListener('click', () => done());

  let current = first;
  // A read that a later one overtook (another tab, or the same after an undo) mounts nothing.
  let reads = 0;
  const load = async () => {
    const { plugin, mount } = current;
    const read = ++reads;
    unmount();
    say('Reading…');
    let model: unknown;
    try {
      ({ model } = await post<{ model: unknown }>('read', { plugin: plugin.name, target }));
    } catch (e) {
      if (read === reads) say(messageOf(e), true);
      return;
    }
    if (read !== reads) return;
    say('');
    const back = current === first ? resumed : undefined;
    resumed = undefined;
    cleanup = mount(body, {
      ...contextOf(plugin.name),
      ...(back === undefined ? {} : { resumed: back }),
      away: (state, task) => {
        const tab = current;
        done(true);
        void task().then(
          (result) => reopen(tab, element, { state, result }),
          (e: unknown) => reopen(tab, element, { state, problem: messageOf(e) }),
        );
      },
      element,
      ...(pointed === undefined ? {} : { pointed }),
      elements: sameAs(element),
      target,
      model,
      apply: async (op) => {
        say('Writing…');
        try {
          const result = await post<{ model: unknown; change: { label: string } }>('apply', { plugin: plugin.name, target, op });
          say(`Saved: ${result.change.label}`);
          void steps();
          return result.model;
        } catch (e) {
          say(messageOf(e), true);
          throw e;
        }
      },
      close: () => done(),
    });
  };
  const show = (tab: Tab) => {
    current = tab;
    for (const b of buttons) b.el.setAttribute('aria-selected', String(b.tab === tab));
    remember(tab);
    void steps();
    void load();
  };
  show(first);
  return { close: done };
}

/** Puts an outline over `r`. */
function place(el: HTMLElement, r: DOMRect): void {
  Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
}

const MARGIN = 8;
// Under this much room on either side, the panel overlaps the element rather than shrink to a sliver beside it.
const LEAST = 160;

/**
 * Keeps a panel beside `r` (the element as it was clicked) and inside the viewport, as its tabs fill it and the
 * window resizes: below, or above where it fits better, its height capped to the room there, so the body scrolls
 * rather than the panel leaving the window. Fixed, so it never changes the page's own scrolling. Answers a release.
 */
function keepInView(panel: HTMLElement, body: HTMLElement, r: DOMRect): () => void {
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fit = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    frame = 0;
    timer = undefined;
    // The viewport without the page's scrollbars.
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    // What the panel would take with no cap: its frame, and all of its body.
    const wanted = panel.offsetHeight - body.clientHeight + body.scrollHeight;
    const top = Math.min(Math.max(r.top, 0), height);
    const bottom = Math.min(Math.max(r.bottom, 0), height);
    const below = height - bottom - 2 * MARGIN;
    const above = top - 2 * MARGIN;
    const cap = Math.max(0, Math.min(height * 0.6, height - 2 * MARGIN));
    let at: number;
    let room: number;
    if (Math.max(below, above) < LEAST) {
      room = height - 2 * MARGIN;
      at = Math.min(Math.max(bottom + MARGIN, MARGIN), height - MARGIN - Math.min(wanted, room));
    } else if (wanted <= below || below >= above) {
      room = Math.min(below, cap);
      at = bottom + MARGIN;
    } else {
      room = Math.min(above, cap);
      at = top - MARGIN - Math.min(wanted, room);
    }
    Object.assign(panel.style, {
      left: `${Math.max(MARGIN, Math.min(r.left, width - MARGIN - panel.offsetWidth))}px`,
      top: `${at}px`,
      bottom: '',
      maxHeight: `${room}px`,
    });
  };
  // Not in the observers' callbacks, where a change of size is a "ResizeObserver loop" error on the page. The next
  // frame, or a moment later where there's none: a hidden tab draws no frames, and its popup still fits when shown.
  const later = () => {
    frame ||= requestAnimationFrame(fit);
    timer ??= setTimeout(fit, 50);
  };
  fit();
  // A tab's content arrives after the panel opens, and changes as it's used, as does the status line. Both, as a
  // resize observer reports only while the page renders: a hidden tab's popup would keep its first place.
  const resized = new ResizeObserver(later);
  resized.observe(panel);
  const changed = new MutationObserver(later);
  changed.observe(panel, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', later);
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    resized.disconnect();
    changed.disconnect();
    window.removeEventListener('resize', later);
  };
}

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function button(text: string, title: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = text;
  el.title = title;
  return el;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
