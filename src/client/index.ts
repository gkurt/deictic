/**
 * `deictic/client`: the overlay the page loads in dev. Hold a shortcut's keys (Alt, deictic's own,
 * by default) and point: the page dims around the element under the pointer that the source marked
 * (`tools/locate.ts`), which stays lit, with its tag, its place and how many elements share it (`lighting.ts`).
 * Press the shortcut's button to open the popup beside it: a tab for each plugin with a panel, at the one used
 * last, or at a plugin's own where its shortcut was pressed.
 *
 * Everything drawn sits in one shadow root, so neither the page's styles nor ours cross over. A
 * panel's undo and redo are its tab's on its element: the latest change that plugin made there.
 */
import type {
  ClientContext,
  ClientPlugin,
  LightboxItem,
  PanelContext,
  Point,
  Problem,
  Resumed,
  Spot,
  Standalone,
  Target,
} from '#src/index.ts';
import { gestureOf, type Shortcut } from '#src/shortcut.ts';

import { dropAway, keepAway, keptAway } from './away.ts';
import { named, tell } from './component.ts';
import { ATTRIBUTE, div, nameOf, POPUP_CLOSED, POPUP_OPENED, type PopupOpened, reduced, sameAs, targetOf } from './dom.ts';
import { drawerIn } from './drawer.ts';
import { openLightbox } from './lightbox.ts';
import { CLEAR, type Lighting, spotlight, spotOf } from './lighting.ts';
import { STYLE } from './style.ts';
import { toolPanel } from './tools.ts';
import { tooltips } from './tooltip.ts';
import { tray } from './tray.ts';

// For a plugin's page half that records the mic, or shows a clip: the waveforms the lightbox draws.
export { drawBars, liveWaveform, peaksOf, type Colors } from './waveform.ts';
export { targetOf } from './dom.ts';

export interface StartOptions {
  /** The dev server's base URL, ending in `/`. */
  base: string;
  /** deictic's own shortcut, checked: it opens the popup at the tab used last. None where it's turned off. */
  shortcut?: Required<Shortcut>;
  /** Each plugin with a half in the page, and its own shortcut as the bundler's plugin checked it, where it has one. */
  plugins: { plugin: ClientPlugin; shortcut?: Required<Shortcut>; options?: unknown }[];
  /** What answers the requests where there's no dev server to: a `standalone` build's. */
  server?: Standalone;
}

/** A request to the endpoints, by its URL: to the dev server, or to what stands in for it. */
type Send = (url: string, init?: RequestInit) => Promise<Response>;

type Mount = (panel: HTMLElement, context: PanelContext<unknown, unknown>) => (() => void) | void;

/** A plugin with a panel: a tab in the popup. */
interface Tab {
  plugin: ClientPlugin;
  mount: Mount;
}

/** An arrow pointing up and out: the link leaves the page for the editor. */
const OUT = icon('M7 17 17 7M8 7h9v9', 2.25);
// Drawn, as the arrows and the cross of a system's font differ in size and weight from one to the next.
const UNDO = icon('M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11');
const REDO = icon('m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13');
const CLOSE = icon('M18 6 6 18M6 6l12 12');
/** Where the tab used last is kept, for deictic's own shortcut to open it again. */
const LAST = 'deictic:tab';
/** How long a read may take, in milliseconds, before the popup says it's reading. */
const SLOW = 200;
const STARTED = Symbol.for('deictic');

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

function icon(path: string, width = 2): string {
  return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

/** What the overlay keeps once started, for `popupIn` to show the popup with. */
interface Started {
  base: string;
  send: Send;
  contextOf: (name: string) => ClientContext;
  tabs: Tab[];
  /** Opens the popup over the page on an element, at a tab or the one used last: `openPopup`. */
  open: (element: Element, tab?: string) => boolean;
}

let started: Started | undefined;

// The events the page hears as the popup opens and closes: kept beside the mark, where a plugin's page half reads them.
export { POPUP_CLOSED, POPUP_OPENED, type PopupOpened } from './dom.ts';

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
  const { base, send, contextOf, tabs } = started;
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
      send,
      root,
      contextOf,
      tabs,
      tab: at,
      remember,
      element,
      target,
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
export function start({ base, shortcut: own, plugins: given, server }: StartOptions): void {
  const page = globalThis as { [STARTED]?: true };
  if (page[STARTED] === true) return;
  page[STARTED] = true;

  const host = document.createElement('deictic-overlay');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.append(style);
  tooltips(root);
  const lighting = spotlight(root);
  const kept = tray();
  // A tool has the page to pick a point on (`pick`): what's under the pointer is lit as while the keys are held.
  let picking = false;
  const tools = toolPanel(root, {
    spotAt: (x, y) => spotAt(x, y),
    aim: (on) => {
      picking = on;
      if (on) glance(true);
      else if (held.length === 0) hide();
    },
  });
  // Out from under the tool panel, where that's on the window's right.
  const drawer = drawerIn(root, { crowded: () => tools.edge() === 'right' });
  // What's typed in the popup is the popup's: the page hears a key from in here as one on the host, not in a field,
  // so its own shortcuts (a "/" to search, a "j" to step) would run on a task's words. Ours listen while capturing.
  for (const type of ['keydown', 'keypress', 'keyup'] as const) host.addEventListener(type, (e) => e.stopPropagation());
  document.documentElement.append(host);

  // Each plugin's API, set up before any panel opens. `use` reads it when asked, so a setup may keep
  // `use` for later, not call it: the plugin it asks for may not be set up yet.
  const apis = new Map<string, unknown>();
  const send: Send =
    server === undefined ? (url, init) => fetch(url, init) : async (url, init) => server(new Request(new URL(url, location.href), init));
  // To the dev server, which says it and hands it on (to the board, with tasks). Whether it got there is no one's to
  // know in the page: it's said in the console too.
  const report = (problem: Problem) => {
    console.error(`deictic${problem.plugin === undefined ? '' : `/${problem.plugin}`}: ${problem.message}`);
    const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(problem) };
    send(`${base}__deictic/problem`, init).catch(() => {});
  };
  const optionsOf = new Map(given.map(({ plugin, options }) => [plugin.name, options]));
  const contextOf = (name: string): ClientContext => ({
    base,
    root,
    options: optionsOf.get(name),
    use: (other) => apis.get(other) as never,
    request: (route, init) => send(`${base}__deictic/plugins/${name}/${route}`, init),
    report: (problem) => report({ ...problem, plugin: name }),
    edit: async ({ file, line, column }) => {
      const res = await send(`${base}__deictic/open?${new URLSearchParams({ file, line: String(line), column: String(column) })}`);
      if (!res.ok) throw new Error(await res.text());
    },
    // Not from under something unsaved, which a press on the page wouldn't close either: its button shakes.
    open: (plugin, element, at) => panel?.guard() !== true && openAt(plugin, element, at),
    lightbox: (items, options) => openLightbox(root, items, options),
    drawer,
    light: (element) => {
      lit = element?.isConnected === true ? element : undefined;
      relight();
    },
    tools,
    tray: kept,
  });
  for (const { plugin } of given) {
    if (plugin.setup === undefined) continue;
    try {
      apis.set(plugin.name, plugin.setup(contextOf(plugin.name)));
    } catch (e) {
      // One plugin's failure is no reason to take the others down with it.
      report(failed(plugin.name, 'set up in the page, so it does nothing there until the page loads again', e));
    }
  }
  const tabs: Tab[] = given.flatMap(({ plugin }) => (plugin.mount === undefined ? [] : [{ plugin, mount: plugin.mount }]));
  started = {
    base,
    send,
    contextOf,
    tabs,
    // Not over a popup holding something unsaved: the press that asked shook its button (`openPanel`).
    open: (element, tab) => tabs.length > 0 && panel?.unsaved() !== true && openAt(tab ?? last().plugin.name, element),
  };
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
    ...(own === undefined || tabs.length === 0 ? [] : [{ shortcut: own, gesture: gestureOf(own), tab: last, named: false }]),
    ...given.flatMap(({ plugin, shortcut }) => {
      if (shortcut === undefined) return [];
      const tab = tabs.find((t) => t.plugin === plugin);
      if (tab !== undefined) return [{ shortcut, gesture: gestureOf(shortcut), tab: () => tab, named: true }];
      console.error(`deictic: ${plugin.name} has a shortcut, but its page half has no \`mount\` to draw a tab with`);
      return [];
    }),
  ];

  let pointer: { x: number; y: number } | undefined;
  let frame = 0;
  let panel: ReturnType<typeof openPanel> | undefined;

  /** The plugins whose keys are held: several, where they share keys and differ by button. */
  const heldBy = (e: MouseEvent | KeyboardEvent) => plugins.filter((p) => p.gesture.held(e));
  /** The plugin a press opens. */
  const pressedBy = (e: MouseEvent) => plugins.find((p) => p.gesture.held(e) && e.button === p.gesture.button);
  /**
   * The marked element at a point, and what's under the pointer inside it where that differs: down through
   * open shadow roots but the overlay's own, as a page showing the popup (`popupIn`) has it in one. `through` the
   * overlay, where it's the overlay that has the pointer: a tool's surface, while a point is picked.
   */
  const hitAt = (x: number, y: number, through = false) => {
    let under = (through ? document.elementsFromPoint(x, y).find((el) => el !== host) : document.elementFromPoint(x, y)) ?? undefined;
    while (under !== undefined && under !== host && under.shadowRoot !== null) {
      const inside = under.shadowRoot.elementFromPoint(x, y);
      if (inside === null || inside === under) break;
      under = inside;
    }
    const el = under === undefined || under === host ? undefined : markedAround(under);
    return el === undefined ? undefined : { el, pointed: under === el ? undefined : under };
  };
  // The plugins whose keys are held now, as the last event said: what's pointed at is shown while there are any.
  let held: typeof plugins = [];
  // What plugins show on the page while it's pointed on (`pointing`), each with what takes it away.
  let glanced: (() => void)[] | undefined;
  const glance = (on: boolean) => {
    if (on === (glanced !== undefined)) return;
    for (const end of glanced ?? []) end();
    glanced = !on
      ? undefined
      : given.flatMap(({ plugin }) => {
          try {
            return plugin.pointing === undefined ? [] : [plugin.pointing(contextOf(plugin.name))];
          } catch (e) {
            report(failed(plugin.name, 'show what it has on the page as it was pointed at', e));
            return [];
          }
        });
  };
  // An element a plugin lights from the overlay's own UI (`context.light`): lit while it says so, whatever the keys.
  let lit: Element | undefined;
  const relight = () => {
    const target = lit === undefined ? undefined : targetOf(lit);
    if (lit !== undefined && target !== undefined) return lighting.point({ el: lit, target, names: [], count: sameAs(lit).length });
    if (held.length > 0 || picking) return show(false);
    lighting.hide();
  };
  const hide = () => {
    held = [];
    tools.point(false);
    drawer.point(false);
    glance(false);
    relight();
  };
  /** The marked element at a point of the window, or the nearest to it where none is under it, and the point in it. */
  const spotAt = (x: number, y: number): Spot | undefined => {
    const away = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width === 0 || r.height === 0
        ? Infinity
        : Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    };
    const nearest = () => {
      let found: { el: Element; far: number } | undefined;
      for (const el of document.querySelectorAll(`[${ATTRIBUTE}]`)) {
        const far = away(el);
        // The later of two as near is the inner one, or the one drawn over.
        if (far !== Infinity && (found === undefined || far <= found.far)) found = { el, far };
      }
      return found?.el;
    };
    const element = hitAt(x, y, true)?.el ?? nearest();
    if (element === undefined) return undefined;
    const r = element.getBoundingClientRect();
    return { element, at: { x: Math.round(x - r.left), y: Math.round(y - r.top) } };
  };
  const show = (glide: boolean) => {
    frame = 0;
    // On something of ours that takes the pointer (a task's pin, the tool panel): the light stays where it was, as
    // the pointer is on its way to a press there, not to another element.
    if (pointer !== undefined && !picking && held.length > 0 && document.elementFromPoint(pointer.x, pointer.y) === host) {
      if (lit !== undefined) relight();
      return;
    }
    const hit = pointer === undefined || (held.length === 0 && !picking) ? undefined : hitAt(pointer.x, pointer.y, picking);
    const el = hit?.el;
    const target = el === undefined ? undefined : targetOf(el);
    if (el === undefined || target === undefined) return lighting.hide();
    // A plugin's own shortcut says its tab, and its button where it isn't the left, which the keys alone don't tell
    // apart. deictic's own says nothing: it opens whichever tab was used last.
    const names = held.flatMap(({ tab, shortcut, named }) => {
      if (!named) return [];
      const { plugin } = tab();
      const name = plugin.label ?? plugin.name;
      return [shortcut.button === 'left' ? name : `${name} (${shortcut.button})`];
    });
    const at = pointer!;
    const tags = given.flatMap(({ plugin }) => {
      if (plugin.tag === undefined) return [];
      try {
        const tag = plugin.tag(contextOf(plugin.name), at);
        return tag === undefined ? [] : [tag];
      } catch (e) {
        report(failed(plugin.name, 'tag what was pointed at', e));
        return [];
      }
    });
    lighting.point(
      { el, ...(hit?.pointed === undefined ? {} : { pointed: hit.pointed }), target, names, count: sameAs(el).length, tags },
      glide,
    );
  };
  const update = (e: MouseEvent | KeyboardEvent) => {
    held = heldBy(e);
    if (held.length === 0 && !picking) return hide();
    tools.point(held.length > 0);
    drawer.point(held.length > 0);
    glance(true);
    if (frame === 0) frame = requestAnimationFrame(() => show(true));
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
  // The page scrolled under the pointer: another element is under it now, or the same one elsewhere.
  window.addEventListener(
    'scroll',
    () => {
      if ((held.length > 0 || picking) && frame === 0) frame = requestAnimationFrame(() => show(false));
    },
    { capture: true, passive: true },
  );
  let press = {};
  let opened: object | undefined;
  // The page as it is under the press, for whoever keeps it (`pressed`): before the page's own handlers, which may
  // close what was open, and before the popup takes the pointer and the focus.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.composedPath().includes(host) || pressedBy(e) === undefined) return;
      const hit = hitAt(e.clientX, e.clientY);
      if (hit === undefined) return;
      for (const { plugin } of given) {
        try {
          plugin.pressed?.(contextOf(plugin.name), hit.el);
        } catch (e) {
          report(failed(plugin.name, 'keep what the page showed as it was pressed', e));
        }
      }
    },
    true,
  );
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
    // Still open after this press's pointerdown, outside it: it holds something unsaved, and shook its button.
    if (panel?.unsaved() === true) return;
    openTab(found.tab(), hit.el, target, undefined, hit.pointed);
  };
  const openTab = (tab: Tab, el: Element, target: Target, resumed?: Resumed, pointed?: Element, at?: Point) => {
    hide();
    panel?.close();
    panel = openPanel({
      base,
      send,
      root,
      contextOf,
      tabs,
      tab,
      remember,
      element: el,
      ...(pointed === undefined ? {} : { pointed }),
      ...(at === undefined ? {} : { at }),
      target,
      lighting,
      onClose: () => (panel = undefined),
      ...(resumed === undefined ? {} : { resumed }),
      reopen: (again, element, kept) => {
        // Rendered again while away, or gone from the page, which moved on: the popup comes back all the same, on
        // the element as it was left, since what it kept (a recording) is about it wherever the page is now.
        const found = element.isConnected ? element : (sameAs(element)[0] ?? element);
        openTab(
          again,
          found,
          targetOf(found) ?? target,
          kept,
          pointed?.isConnected === true && found === element ? pointed : undefined,
          at,
        );
      },
    });
  };
  // What the page before this left a panel for (`away`), where that carries on here: the popup comes back when
  // it's done, on the element where this page has it, and on a stand-in for it where it doesn't.
  void keptAway().then((away) => {
    if (away === undefined) return;
    const tab = tabs.find((t) => t.plugin.name === away.tab);
    const task = tab?.plugin.resume?.(contextOf(away.tab));
    if (tab === undefined || task === undefined) return dropAway();
    const back = (resumed: Resumed) => {
      dropAway();
      const { loc, tag } = away.target;
      const absent = document.createElement(tag);
      absent.setAttribute(ATTRIBUTE, `${loc.file}:${loc.line}:${loc.column}`);
      const found = sameAs(absent).find((el) => el.localName === tag);
      // The spot only where this page has the element: there's nowhere for it otherwise.
      openTab(tab, found ?? absent, away.target, resumed, undefined, found === undefined ? undefined : away.at);
    };
    task.then(
      (result) => back({ state: away.state, result }),
      (e: unknown) => back({ state: away.state, problem: messageOf(e) }),
    );
  });
  function openAt(name: string, given: Element, at?: Point): boolean {
    const tab = tabs.find((t) => t.plugin.name === name);
    const el = given.isConnected ? given : (sameAs(given)[0] ?? undefined);
    const target = el === undefined ? undefined : targetOf(el);
    if (tab === undefined || el === undefined || target === undefined) return false;
    openTab(tab, el, target, undefined, undefined, at);
    return true;
  }
  for (const type of ['click', 'auxclick', 'contextmenu'] as const) window.addEventListener(type, pressed, true);
}

interface PanelOptions {
  base: string;
  send: Send;
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
  /** The spot in `element` it's opened on, where it's one: what's lit, and what it's beside. */
  at?: Point;
  target: Target;
  /**
   * Over the page, beside the element: what lights the element there. Without it the popup is shown where the
   * page put it (`popupIn`): nothing on the page is lit, and Esc leaves it alone.
   */
  lighting?: Lighting;
  /** Called as it closes: the tab it showed, and whether it's leaving for a tab's `away`, to come back by `reopen`. */
  onClose: (shown: Tab, leaving: boolean) => void;
  /** What the first tab's mount gets, coming back from `away`. */
  resumed?: Resumed;
  /** Opens the popup again, at a tab on an element, coming back from `away`. */
  reopen: (tab: Tab, element: Element, resumed: Resumed) => void;
}

function openPanel({
  base,
  send,
  root,
  contextOf,
  tabs,
  tab: first,
  remember,
  element,
  pointed,
  at: spot,
  target,
  lighting,
  onClose,
  resumed: coming,
  reopen,
}: PanelOptions): {
  close: () => void;
  unsaved: () => boolean;
  /** Whether it holds something unsaved, whose button it then shakes: what asks before opening another over it. */
  guard: () => boolean;
} {
  const pinned = lighting === undefined;
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
  // What it is too, as the caption said it while pointing, which is gone once the popup is open.
  const tag = Object.assign(document.createElement('span'), { className: 'tag', textContent: tell(named(element)) });
  // An arrow out, as it leaves the page for the editor; its title is the overlay's tooltip (`tooltip.ts`).
  where.append(tag, file);
  where.insertAdjacentHTML('beforeend', OUT);
  where.title = 'Open in editor';
  where.setAttribute('aria-label', `Open ${file.textContent} in the editor`);
  // The element's place, as a request's query names it.
  const at = { file: target.loc.file, line: String(target.loc.line), column: String(target.loc.column) };
  where.href = `${base}__deictic/open?${new URLSearchParams(at)}`;
  where.addEventListener('click', (e) => {
    e.preventDefault();
    void send(where.href);
  });
  // Off until the tab's history is read: there's nothing to take back on most elements.
  const undo = iconButton(UNDO, 'Undo', 'Nothing to undo');
  const redo = iconButton(REDO, 'Redo', 'Nothing to redo');
  undo.disabled = redo.disabled = true;
  const close = iconButton(CLOSE, 'Close', pinned ? 'Close' : 'Close (Esc)');
  const buttons = tabs.map((tab) => {
    const el = button(tab.plugin.label ?? tab.plugin.name, '');
    el.className = 'tab';
    el.setAttribute('role', 'tab');
    el.addEventListener('click', () => show(tab));
    return { tab, el };
  });
  // What marks the shown tab, behind it, and slides to the next one shown.
  const thumb = div('thumb');
  const slide = (to: HTMLElement) => {
    Object.assign(thumb.style, { left: `${to.offsetLeft}px`, width: `${to.offsetWidth}px` });
    // Laid out where it is before it may move: the first place is no slide from the head's corner.
    void thumb.offsetWidth;
    thumb.classList.add('moves');
  };
  close.classList.add('end');
  head.append(thumb, ...buttons.map((b) => b.el), close);
  bar.append(where, undo, redo);
  // Back from `away` on a page that doesn't have the element: said, as nothing on it is lit.
  if (!element.isConnected)
    where.after(Object.assign(document.createElement('span'), { className: 'absent', textContent: 'not on this page' }));
  const body = div('body');
  body.setAttribute('role', 'tabpanel');
  const status = div('status');
  panel.append(head, bar, body, status);
  root.append(panel);
  if (pinned) panel.classList.add('pinned');
  const release = pinned ? undefined : keepInView(panel, body, head, element, spot);
  // Its element, or the spot in it, lit for as long as it's open.
  const unmark = lighting?.hold(element, panel, spot);
  if (!pinned) window.dispatchEvent(new CustomEvent<PopupOpened>(POPUP_OPENED, { detail: { element, tab: first.plugin.name } }));

  let cleanup: (() => void) | void;
  // The button that keeps what the shown tab would lose, while there's something: `unsaved`, from the panel.
  let holding: HTMLElement | undefined;
  const say = (text: string, problem = false) => {
    status.textContent = text;
    status.classList.toggle('problem', problem);
  };
  const post = async <T>(route: string, body?: unknown): Promise<T> => {
    const res = await send(`${base}__deictic/${route}`, {
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
    holding = undefined;
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
      const res = await send(`${base}__deictic/history?${new URLSearchParams({ plugin: current.plugin.name, ...at })}`);
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
    unmark?.();
    panel.remove();
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onOutside, true);
    if (!pinned) window.dispatchEvent(new CustomEvent(POPUP_CLOSED));
    onClose(current, leaving);
  };
  const onKey = (e: KeyboardEvent) => {
    // A plugin's modal over the popup (one marked `data-deictic-modal`) takes Esc for itself.
    if (e.key !== 'Escape' || root.querySelector('[data-deictic-modal]') !== null) return;
    // Esc is the popup's while it's open: a dialog of the page's that it's open in stays open.
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  // A press on the page closes the popup, as it would a menu, unless that loses something: then the button that
  // keeps it shakes. Anything in the overlay is the popup's own: a modal, the lightbox, the surface marks are drawn on.
  const onOutside = (e: PointerEvent) => {
    if (e.composedPath().includes(root.host)) return;
    if (holding === undefined) return done();
    shake(holding);
  };
  if (!pinned) {
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onOutside, true);
  }
  undo.addEventListener('click', () => void step('undo'));
  redo.addEventListener('click', () => void step('redo'));
  close.addEventListener('click', () => done());

  let current = first;
  // A read that a later one overtook (another tab, or the same after an undo) mounts nothing.
  let reads = 0;
  const load = async () => {
    const { plugin, mount } = current;
    const read = ++reads;
    // The body keeps its height while it's empty, and "Reading…" waits for a read that takes long: one answered
    // at once, as most are, would otherwise fold the popup and open it again in a blink.
    body.style.minHeight = `${body.offsetHeight}px`;
    unmount();
    say('');
    const slow = setTimeout(() => read === reads && say('Reading…'), SLOW);
    let model: unknown;
    try {
      ({ model } = await post<{ model: unknown }>('read', { plugin: plugin.name, target }));
    } catch (e) {
      if (read !== reads) return;
      body.style.minHeight = '';
      say(messageOf(e), true);
      return;
    } finally {
      clearTimeout(slow);
    }
    if (read !== reads) return;
    body.style.minHeight = '';
    say('');
    const back = current === first ? resumed : undefined;
    resumed = undefined;
    try {
      cleanup = mount(body, {
        ...contextOf(plugin.name),
        ...(back === undefined ? {} : { resumed: back }),
        away: (state, task) => {
          const tab = current;
          done(true);
          // For the tab's next page too, should this one go before the task is done. Not one a page pinned: that's the page's own.
          if (!pinned) keepAway({ tab: tab.plugin.name, target, state, ...(spot === undefined ? {} : { at: spot }) });
          const back = (resumed: Resumed) => {
            if (!pinned) dropAway();
            reopen(tab, element, resumed);
          };
          void task().then(
            (result) => back({ state, result }),
            (e: unknown) => back({ state, problem: messageOf(e) }),
          );
        },
        element,
        ...(pointed === undefined ? {} : { pointed }),
        ...(spot === undefined ? {} : { at: spot }),
        elements: sameAs(element),
        target,
        model,
        apply: async (op, on = target) => {
          say('Writing…');
          try {
            const result = await post<{ model: unknown }>('apply', { plugin: plugin.name, target: on, op });
            say('');
            void steps();
            return result.model;
          } catch (e) {
            say(messageOf(e), true);
            throw e;
          }
        },
        close: () => done(),
        unsaved: (action) => {
          if (read === reads) holding = action;
        },
      });
    } catch (e) {
      say(messageOf(e), true);
      contextOf(plugin.name).report(failed(plugin.name, 'show its panel', e));
    }
  };
  const show = (tab: Tab) => {
    current = tab;
    for (const b of buttons) {
      b.el.setAttribute('aria-selected', String(b.tab === tab));
      if (b.tab === tab) slide(b.el);
    }
    remember(tab);
    void steps();
    void load();
  };
  show(first);
  const guard = () => {
    if (holding !== undefined) shake(holding);
    return holding !== undefined;
  };
  return { close: done, unsaved: () => holding !== undefined, guard };
}

/** Shakes a panel's button, in view: what a press outside does where closing would lose something. A blink where motion is reduced. */
function shake(el: HTMLElement): void {
  el.scrollIntoView({ block: 'nearest' });
  if (reduced()) return void el.animate({ opacity: [1, 0.3, 1, 0.3, 1] }, 400);
  el.animate({ translate: ['0', '-5px', '5px', '-4px', '4px', '-2px', '0'] }, { duration: 360, easing: 'ease-out' });
}

const MARGIN = 8;
// Under this much room on either side, the panel overlaps the element rather than shrink to a sliver beside it.
const LEAST = 160;
/** How far from the element the popup is, in pixels: room for the line between them. */
const APART = 32;

/** How far a press on the head moves, in pixels, before it's a drag: a click there leaves the popup following. */
const SLACK = 3;

/**
 * Keeps a panel beside `element` and inside the viewport, as its tabs fill it, the window resizes and the element
 * moves with the page: to its right, or its left, where there's the room, level with its top and as tall as the
 * window lets it be; else below, or above where it fits better, its height capped to the room there, so the body
 * scrolls rather than the panel leaving the window. Off the element either way (`APART`): it's what's lit, with
 * room for the line between them. Dragged by `handle`, it stays where it's put, in the window, and follows the
 * element no more. Fixed, so it never changes the page's own scrolling. Answers a release.
 */
function keepInView(panel: HTMLElement, body: HTMLElement, handle: HTMLElement, element: Element, at?: Point): () => void {
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // What it's beside: the element, or the spot in it.
  const boxOf = () => (at === undefined ? element.getBoundingClientRect() : spotOf(element, at));
  // Where the element was last seen: one gone from the page leaves the popup where it was.
  let r = boxOf();
  // An element that's not on the page (back from `away`, on another) has no place to be beside: as if dragged to the
  // middle, toward the top.
  let moved: { left: number; top: number } | undefined = element.isConnected
    ? undefined
    : { left: (document.documentElement.clientWidth - panel.offsetWidth) / 2, top: document.documentElement.clientHeight / 5 };
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
    if (moved !== undefined) {
      const room = Math.max(0, height - 2 * MARGIN);
      Object.assign(panel.style, {
        left: `${Math.max(MARGIN, Math.min(moved.left, width - MARGIN - panel.offsetWidth))}px`,
        top: `${Math.max(MARGIN, Math.min(moved.top, height - MARGIN - Math.min(wanted, room)))}px`,
        maxHeight: `${room}px`,
      });
      return;
    }
    const top = Math.min(Math.max(r.top, 0), height);
    const bottom = Math.min(Math.max(r.bottom, 0), height);
    const gap = APART;
    const right = width - MARGIN - panel.offsetWidth - (r.right + gap);
    const left = r.left - gap - panel.offsetWidth - MARGIN;
    if (right >= 0 || left >= 0) {
      const room = Math.max(0, height - 2 * MARGIN);
      Object.assign(panel.style, {
        left: `${right >= 0 ? r.right + gap : r.left - gap - panel.offsetWidth}px`,
        top: `${Math.max(MARGIN, Math.min(r.top - CLEAR, height - MARGIN - Math.min(wanted, room)))}px`,
        maxHeight: `${room}px`,
        // It grows out of the side the element is on, as it opens.
        transformOrigin: right >= 0 ? '0 24px' : '100% 24px',
      });
      return;
    }
    const below = height - bottom - gap - MARGIN;
    const above = top - gap - MARGIN;
    const cap = Math.max(0, Math.min(height * 0.6, height - 2 * MARGIN));
    let at: number;
    let room: number;
    if (Math.max(below, above) < LEAST) {
      room = height - 2 * MARGIN;
      at = Math.min(Math.max(bottom + gap, MARGIN), height - MARGIN - Math.min(wanted, room));
    } else if (wanted <= below || below >= above) {
      room = Math.min(below, cap);
      at = bottom + gap;
    } else {
      room = Math.min(above, cap);
      at = top - gap - Math.min(wanted, room);
    }
    Object.assign(panel.style, {
      left: `${Math.max(MARGIN, Math.min(r.left, width - MARGIN - panel.offsetWidth))}px`,
      top: `${at}px`,
      bottom: '',
      maxHeight: `${room}px`,
      transformOrigin: at < top ? '24px 100%' : '24px 0',
    });
  };
  // Not in the observers' callbacks, where a change of size is a "ResizeObserver loop" error on the page. The next
  // frame, or a moment later where there's none: a hidden tab draws no frames, and its popup still fits when shown.
  const later = () => {
    frame ||= requestAnimationFrame(fit);
    timer ??= setTimeout(fit, 50);
  };
  fit();
  // Read each frame, as nothing tells of an element moving: the page scrolls, its layout shifts, a panel previews.
  let watching = requestAnimationFrame(function watch() {
    if (moved !== undefined) return;
    watching = requestAnimationFrame(watch);
    if (!element.isConnected) return;
    const now = boxOf();
    if (now.left === r.left && now.top === r.top && now.width === r.width && now.height === r.height) return;
    r = now;
    fit();
  });
  // A drag starts on the head itself, not on a tab or the close in it.
  let from: { x: number; y: number; left: number; top: number } | undefined;
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button') !== null) return;
    // Kept from the browser: no text selected along the way, and the field being typed in keeps its focus.
    e.preventDefault();
    const at = panel.getBoundingClientRect();
    from = { x: e.clientX, y: e.clientY, left: at.left, top: at.top };
    handle.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (from === undefined) return;
    const x = e.clientX - from.x;
    const y = e.clientY - from.y;
    if (moved === undefined && Math.hypot(x, y) < SLACK) return;
    moved = { left: from.left + x, top: from.top + y };
    panel.classList.add('dragging');
    fit();
  };
  const up = () => {
    from = undefined;
    panel.classList.remove('dragging');
  };
  handle.addEventListener('pointerdown', down);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
  // A tab's content arrives after the panel opens, and changes as it's used, as does the status line. Both, as a
  // resize observer reports only while the page renders: a hidden tab's popup would keep its first place.
  const resized = new ResizeObserver(later);
  resized.observe(panel);
  const changed = new MutationObserver(later);
  changed.observe(panel, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', later);
  return () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(watching);
    clearTimeout(timer);
    resized.disconnect();
    changed.disconnect();
    window.removeEventListener('resize', later);
  };
}

/** A button that is a drawing: named for what it does, as its title, the tooltip, changes with what it would do. */
function iconButton(svg: string, name: string, title: string): HTMLButtonElement {
  const el = button('', title);
  el.className = 'icon';
  el.innerHTML = svg;
  el.setAttribute('aria-label', name);
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

/** A plugin's page half that threw: a bug of the plugin's, to report where it's made. Its key is the first line of what it threw. */
const failed = (plugin: string, what: string, e: unknown): Problem => ({
  key: `page:${plugin}:${what.split(' ', 1)[0]}:${messageOf(e).split('\n', 1)[0]!.slice(0, 200)}`,
  kind: 'bug',
  plugin,
  message: `${plugin} failed to ${what}: ${messageOf(e)}`,
  ...(e instanceof Error && e.stack !== undefined ? { details: e.stack } : {}),
});
