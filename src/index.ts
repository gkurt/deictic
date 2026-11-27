/**
 * `deictic`: what a plugin is. Every plugin is optional: deictic itself is the glue (the
 * transform that ties elements to source, the dev server's endpoints, the history, shortcuts and the
 * overlay's panel), and each plugin adds what it does on top.
 *
 * A plugin has two halves, each optional that meet over the dev server's endpoints (`tools/endpoints.ts`). The
 * server half runs beside the bundler and is the only one that reads source: it turns the element
 * under the pointer into a model its panel can show, and an op from that panel into text edits. It
 * never writes files; deictic does, so every plugin's changes land in one history and undo the
 * same way. A change that isn't to a file (a task added to a board) the plugin makes itself and
 * answers with what it did (`Done`): the history keeps that beside the files' changes and hands it
 * back to the plugin's own `undo` and `redo`.
 * The client half is a module the page loads, named by the server half's `client`, which draws the
 * panel and previews an op on the page before it is applied.
 *
 * A plugin may have no panel at all, only an API for others (screenshots, a recording) and routes of
 * its own on the dev server. Each half's `setup` answers its API, and `use(name)` reaches another
 * plugin's, on the same side; `needs` names the plugins it can't do without.
 *
 * Both halves import from here, so the parser is imported for its types only: the browser must not load it.
 */
import type { JSXOpeningElement, Program } from 'oxc-parser';

import type { Shortcut } from './shortcut.ts';

export type { Modifier, Shortcut } from './shortcut.ts';

/** A place in the source: the file from the project's root, with `/`, and the line and column, from 1. */
export interface Loc {
  file: string;
  line: number;
  column: number;
}

/** An element the pointer picked: where its opening tag starts, and the tag, which the server checks is still there. */
export interface Target {
  loc: Loc;
  tag: string;
}

/** Text in a file to replace, by UTF-16 offsets. `file` is the target's unless named, from the project's root. */
export interface TextEdit {
  file?: string;
  start: number;
  end: number;
  text: string;
}

/** What a server half reads: the target's file, parsed, and its element. */
export interface Source {
  /** The target's file, from the project's root. */
  file: string;
  code: string;
  /** The file's module; for an `.astro` component, its frontmatter's. */
  program: Program;
  /** The target's opening tag. */
  element: JSXOpeningElement;
  /** Another file under the project's root, for plugins whose edits go elsewhere (a locale's messages). */
  read(file: string): string;
}

/**
 * What answers the overlay's requests in a page with no dev server behind it (`deictic/vite`'s `standalone`): the
 * default export of a module of the page's. A request is one the endpoints would get, under `<base>__deictic/`;
 * the answer is theirs too (`{ model }`, `{ model, change }`, `{ problem }` with a status that isn't ok).
 */
export type Standalone = (request: Request) => Response | Promise<Response>;

/** An op a plugin won't make. The message says why and what to do instead; the panel shows it. */
export class Refusal extends Error {
  override name = 'Refusal';
}

/**
 * A change the plugin made itself, not to a file: what its `undo` and `redo` need to take it back and
 * make it again. JSON, since the history keeps it on disk across restarts of the dev server.
 */
export interface Done<Record = unknown> {
  done: Record;
}

type Maybe<T> = T | Promise<T>;

/**
 * Something of deictic's that went wrong, which nothing a person did in the page caused: a package the project
 * hasn't installed, a plugin that failed. The dev server says it, and hands it to each plugin with a `problem`
 * (tasks posts it to the board, for an agent to fix).
 */
export interface Problem {
  /**
   * What tells it apart, and the same problem again from a new one: `packages:rrweb`, `setup:tailwind`. Never a
   * time or an ID, so a problem that comes back is known.
   */
  key: string;
  /**
   * `setup`: the project's to fix, as `message` says (install a package, configure a plugin). `bug`: deictic's own, or
   * a plugin's, to report where it's made, not to patch where it's installed.
   */
  kind: 'setup' | 'bug';
  /** What went wrong, and the fix where there is one, as any problem message says it. */
  message: string;
  /** What more there is to look into: a stack. */
  details?: string;
  /** The plugin it's about, where it's one's: none for deictic's own. */
  plugin?: string;
}

/**
 * Each plugin's API to the others on the server, by name. A plugin adds its own, so `use` knows its type:
 * `declare module 'deictic' { interface ServerApis { screenshots: Screenshots } }`.
 */
// oxlint-disable-next-line typescript/no-empty-interface -- filled by declaration merging
export interface ServerApis {}

/** The same, in the page: `declare module 'deictic' { interface ClientApis { screenshots: Capture } }`. */
// oxlint-disable-next-line typescript/no-empty-interface -- filled by declaration merging
export interface ClientApis {}

/** A plugin's API, by its name: what its package declared, or `unknown` for one that declared none. */
export type ApiOf<Apis, Name extends string> = Name extends keyof Apis ? Apis[Name] : unknown;

export interface ServerContext {
  /** The project's root, as an absolute path. */
  root: string;
  /**
   * Another plugin's API, as its `setup` answered it, or nothing when it isn't loaded (or its `setup` failed,
   * which is reported). One the plugin `needs` always is loaded; any other may not be, so check.
   */
  use: <Name extends string>(name: Name) => ApiOf<ServerApis, Name> | undefined;
  /** Says a problem of the plugin's own, as deictic says its own: in the dev server's output, and to each plugin's `problem`. */
  report: (problem: Problem) => void;
  /**
   * Runs `callback` as the dev server closes, to undo what `setup` did beyond the plugin itself: a global it set, a
   * watcher or a server it started. Under Vite and webpack; a dev server that only ends with its process runs none.
   */
  onClose: (callback: () => Maybe<void>) => void;
}

/**
 * A route of the plugin's own, at `/__deictic/plugins/<name>/<route>`, and below it. A `GET` must
 * change nothing: anything else reaches it only from the page itself, which deictic checks.
 */
export type Route = (request: Request, context: ServerContext) => Maybe<Response>;

export interface ServerPlugin<Model = unknown, Op = unknown, Record = unknown, Api = unknown> {
  /** Ties the halves together; also the label of its changes in the history, and its routes' path. Lowercase, with `-`. */
  name: string;
  /** The module the page loads for this plugin's half there, which default-exports its `ClientPlugin`. */
  client?: string;
  /** What the page half gets as `context.options`: the user's options it needs there, as JSON. */
  clientOptions?: unknown;
  /** What opens its panel: its own default, which its options let the user change. A plugin with no panel has none. */
  shortcut?: Shortcut;
  /** The plugins it can't do without, by name: the dev server won't start without them. */
  needs?: string[];
  /**
   * The packages it imports that the project installs itself (optional peers), by name: as the dev server starts,
   * it says how to install any that's missing, rather than failing when first used.
   */
  packages?: string[];
  /** Runs once, as the dev server starts and before it answers anything. Answers the plugin's API to the others. */
  setup?(context: ServerContext): Maybe<Api>;
  /** Routes of its own, by their first segment under `/__deictic/plugins/<name>/`. */
  routes?: { [route: string]: Route };
  /**
   * The model its panel shows for an element. Without it, the panel gets none. `source` is a `Refusal` where the
   * element isn't to be found in its file (it doesn't parse, or the page runs other code than it has): throw it where
   * the plugin needs the source, or go on without it, as a task does.
   */
  read?(source: Source | Refusal, target: Target): Maybe<Model>;
  /** Text edits for deictic to write, which it refuses without the source, or a change the plugin made itself. */
  apply?(source: Source | Refusal, target: Target, op: Op): Maybe<TextEdit[] | Done<Record>>;
  /**
   * Takes back a change `apply` made itself, or throws a `Refusal` saying why it can't any more. It may
   * answer what the next redo needs, where that differs (what it put back has a new ID).
   */
  undo?(record: Record): Maybe<void | Record>;
  /** Makes it again after an undo, and answers what the next undo needs, which may differ (a new ID). */
  redo?(record: Record): Maybe<Record>;
  /** Says what an op does, for the history: `className: px-2 → px-4`. */
  describe?(op: Op, before: Model): string;
  /**
   * Hears each problem deictic or a plugin reports, on the server or in the page, after every `setup` has run: once
   * per `key` while the dev server runs. Its own failure is only said, never reported again.
   */
  problem?(problem: Problem): Maybe<void>;
}

export const definePlugin = <Model, Op, Record = unknown, Api = unknown>(
  plugin: ServerPlugin<Model, Op, Record, Api>,
): ServerPlugin<Model, Op, Record, Api> => plugin;

/** Where something is in an element, in CSS pixels from its top left. */
export interface Point {
  x: number;
  y: number;
}

/** A spot on the page: a marked element, and a point in it (or beside it, for the nearest to a point no marked element is under). */
export interface Spot {
  element: Element;
  at: Point;
}

/**
 * The tool panel: a bar docked to an edge of the window, which shows while a shortcut's keys are held and stays
 * while it's in use. A plugin adds its tools to it from its page half's `setup`.
 */
export interface ToolPanel {
  /**
   * Adds a plugin's controls, as one group, in the order plugins are loaded. Groups of one `section` sit together,
   * with no line between them, after the groups of none: the screenshots', recordings', voice's and tasks' are
   * `capture`. `last` puts a group at the end of its section, or after all the others for one of none. Each control is a button named by its `title`; its `aria-keyshortcuts`
   * (`B`, `Control+Z`) is the key the panel hears for it, alone or with the keys held to point, and what its tooltip
   * shows.
   */
  add: (group: HTMLElement, options?: { last?: boolean; section?: string }) => void;
  /**
   * Takes the page for a tool that works on it (drawing, picking a point): the tool that had it lets go first, and
   * the panel stays shown. `left` is called when another takes it, or Esc or the pointer tool gives the page back.
   * Answers what lets go of it, for the tool to call when it's done on its own.
   */
  hold: (left: () => void) => () => void;
  /** Keeps the panel shown while something goes on that its controls end (a recording). Answers what ends that. */
  keep: () => () => void;
  /**
   * Takes the page until a point of it is pressed, lighting what's under the pointer as pointing does: answers the
   * spot, the marked element there or the nearest to it, or nothing where the page was given back first.
   */
  pick: () => Promise<Spot | undefined>;
}

/**
 * The drawer: on the window's side, where what the plugins have for the page lands, a section each. It
 * shows while a shortcut's keys are held and a section has something, and stays while it's in use.
 */
export interface Drawer {
  /**
   * Adds a section, in the order added, or before the others with `first`. A section that has nothing to show sets
   * its own `hidden`: the drawer stays away while every one is. Folded away, the drawer counts what the sections
   * have: each says how many things it lists in `data-count`, and how many are unread in `data-unread`.
   */
  add: (section: HTMLElement, options?: { first?: boolean }) => void;
  /**
   * Opens one item in the drawer, in the sections' place, under `title` and a way back. The drawer stays while it's
   * open. `closed` is called when it's left, by the way back, Esc, or another item opening. Answers what closes it.
   */
  show: (view: HTMLElement, options?: { title?: string; closed?: () => void }) => () => void;
  /** Keeps the drawer up while something goes on in it; answers what lets it go. */
  keep: () => () => void;
}

/** Something a plugin made on the page that nothing has taken yet: a shot, a recording, a voice clip. */
export interface TrayItem {
  /** The plugin that made it. */
  plugin: string;
  /** Its ID, as that plugin has it. */
  id: string;
  /** What that plugin says of it, as JSON: the screenshots plugin's `Shot`, a `Recording`, a `Clip`. */
  value: unknown;
}

/**
 * What plugins made on the page from the tool panel, until something takes it: a task attaches what's there and
 * removes it. Kept for the tab's session, so it's there on the tab's next page too.
 */
export interface Tray {
  /** What's kept, oldest first: all of it, or one plugin's. */
  list: (plugin?: string) => TrayItem[];
  add: (plugin: string, id: string, value: unknown) => void;
  /** Takes one out, or all of a plugin's. */
  remove: (plugin: string, id?: string) => void;
  /** Hears every change from now on; answers what stops it. */
  subscribe: (listener: () => void) => () => void;
}

export interface ClientContext {
  /** The dev server's base URL, ending in `/`. */
  base: string;
  /** deictic's shadow root, to draw in: neither the page's styles nor the overlay's cross over. */
  root: ShadowRoot;
  /** The server half's `clientOptions`, or nothing. */
  options: unknown;
  /** Another plugin's API in the page, as its `setup` answered it, or nothing when it isn't loaded. */
  use: <Name extends string>(name: Name) => ApiOf<ClientApis, Name> | undefined;
  /** Asks one of this plugin's own routes, from the page: `request('shots', { method: 'POST', body: blob })`. */
  request: (route: string, init?: RequestInit) => Promise<Response>;
  /** Says a problem of the plugin's own to the dev server, as the server half's `report` does: its `plugin` is this one. */
  report: (problem: Problem) => void;
  /**
   * Opens a place in a file under the root in the editor, as the popup's own link opens the element's: through the
   * dev server, or what answers in its place (`Standalone`). Rejects with why it couldn't.
   */
  edit: (place: Loc) => Promise<void>;
  /**
   * Opens the popup on an element at a plugin's tab, as its shortcut would, or with `at` on a spot in it: the
   * popup is then beside the spot, which is what's lit, and the tab's context has it. An element rendered again
   * since stands in for one no longer on the page. False when there's no such tab or no such element any more, and
   * while the open popup holds something unsaved, whose button then shakes. Not as `setup` runs, which is before the
   * popup can open.
   */
  open: (plugin: string, element: Element, at?: Point) => boolean;
  /** The tool panel, to add this plugin's tools to. */
  tools: ToolPanel;
  /** What was made from the tool panel and not taken yet. */
  tray: Tray;
  /** The drawer, to add this plugin's section to. */
  drawer: Drawer;
  /**
   * Lights an element on the page as pointing at it does, for something of the overlay's own that stands for it (a
   * task's row in the drawer, while the pointer is on it); none puts the light back as it was.
   */
  light: (element?: Element) => void;
  /**
   * Shows `items` in the lightbox over everything, at `at` (the first by default), stepping between them with
   * ← and →. With `from`, it grows out of that element (the chip clicked) and shrinks back into it on close.
   */
  lightbox: (items: LightboxItem[], options?: LightboxOptions) => { close: () => void };
}

/** What the lightbox shows: a picture, a page in a frame (a recording's replay), or a sound with its waveform. */
export type LightboxItem = {
  /** Its name, over it. */
  title: string;
  /** Buttons beside the name: each closes the lightbox and runs. */
  actions?: LightboxAction[];
} & ({ kind: 'image'; url: string } | { kind: 'page'; url: string } | { kind: 'audio'; url: string });

export interface LightboxAction {
  label: string;
  title?: string;
  run: () => void;
}

export interface LightboxOptions {
  /** The item it opens at. */
  at?: number;
  /** The element it grows out of, and goes back into. */
  from?: Element;
}

export interface PanelContext<Model, Op> extends ClientContext {
  /**
   * The element clicked: the one the source marked, under the pointer or around what is. Back from `away`
   * it may be off the page (`isConnected` is false), where the page moved on without it: the element as it
   * was left, or after a page load an empty one of its tag and mark. `elements` is then empty.
   */
  element: Element;
  /**
   * What was under the pointer, where it isn't `element` but inside it: markup nothing marked, as a
   * dependency's, or in an open shadow root, as the popup's own on a page that shows it (`popupIn`).
   */
  pointed?: Element;
  /** The spot in `element` the popup was opened on, where it was (the tool panel's task tool), not the element as a whole. */
  at?: Point;
  /** Every element on the page from the same place in the source, the clicked one among them: the rows of a list. */
  elements: Element[];
  target: Target;
  model: Model;
  /**
   * Applies an op on disk, and reads the model again. Rejects with the server's reason, which the panel also shows.
   * On another element with `on`, whose model is then the one answered: for an op that's about that one.
   */
  apply(op: Op, on?: Target): Promise<Model>;
  close: () => void;
  /**
   * Says there's something here that leaving would lose (words typed, a change tried on the page), and the button
   * that keeps it: a click outside the popup then shakes that button, where it would have closed the popup.
   * `undefined` once there's nothing to lose. Forgotten as the panel unmounts.
   */
  unsaved: (action: HTMLElement | undefined) => void;
  /**
   * Leaves the popup to do something on the page, then comes back: closes it, runs `task` (a recording, a
   * pick of another element), and opens it again at this tab on this element. The next mount gets
   * `resumed`: the `state` kept now (what was typed, what's attached), and what `task` answered, or why
   * it failed. The state stays in the page, as it is: no need for JSON. It's also kept for the tab's next
   * page, as a structured clone, where it can be one: after a page load, the plugin's `resume` says whether
   * the task carries on, and the popup comes back there.
   */
  away: <T>(state: unknown, task: () => Promise<T>) => void;
  /** Set when this mount is the panel coming back from `away`. */
  resumed?: Resumed;
}

/** What a panel coming back from `away` gets: the state it kept, and the task's result or problem. */
export interface Resumed {
  state: unknown;
  result?: unknown;
  /** Why the task failed: its error's message. */
  problem?: string;
}

/** A plugin's own tag in the caption over what's pointed at, after deictic's: prosebook's names the string's key. */
export interface Tag {
  text: string;
  /** Its background, a CSS color: deictic's accent unset. Its text is white. */
  color?: string;
}

export interface ClientPlugin<Model = unknown, Op = unknown, Api = unknown> {
  /** The server half's `name`. */
  name: string;
  /** Shown over the element while its shortcut's keys are held, and atop the panel. */
  label?: string;
  /**
   * Runs once, as the page starts, before any panel opens (a recording starts here). Answers the
   * plugin's API to the others in the page, at once: one that needs time keeps its promises inside it.
   */
  setup?(context: ClientContext): Api;
  /**
   * Asked as a page starts where the page before it left this plugin's panel `away`: the task it left for,
   * where that carries on in this page (a recording does), or nothing where it ended with the page. When it's
   * done the popup opens at this tab with `resumed`, on the element where this page has it and without where not.
   */
  resume?(context: ClientContext): Promise<unknown> | undefined;
  /**
   * What it shows on the page while a shortcut's keys are held, and the page is dimmed to point on: the tasks
   * plugin pins each task where its element is. Answers what takes it away.
   */
  pointing?(context: ClientContext): () => void;
  /**
   * Its tag in the caption for what's under the pointer, at `at` in the window's CSS pixels, or nothing. Asked on
   * every move while pointing, so it must be quick.
   */
  tag?(context: ClientContext, at: Point): Tag | undefined;
  /**
   * A shortcut's press on a marked element, before the page hears it and before the popup opens: the page as the
   * person saw it, a tooltip still open under the pointer, a menu still focused. Called as the press goes down, so
   * it must be quick; the screenshots plugin keeps what a shot needs here, and renders it later.
   */
  pressed?(context: ClientContext, element: Element): void;
  /** Draws into `panel`, inside deictic's shadow root. Returns what to undo on the page when the panel closes. */
  mount?: (panel: HTMLElement, context: PanelContext<Model, Op>) => (() => void) | void;
}

export const defineClientPlugin = <Model, Op, Api = unknown>(plugin: ClientPlugin<Model, Op, Api>): ClientPlugin<Model, Op, Api> => plugin;
