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
  program: Program;
  /** The target's opening tag. */
  element: JSXOpeningElement;
  /** Another file under the project's root, for plugins whose edits go elsewhere (a locale's messages). */
  read(file: string): string;
}

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
   * Another plugin's API, as its `setup` answered it, or nothing when it isn't loaded. One the plugin
   * `needs` always is; any other may not be, so check.
   */
  use: <Name extends string>(name: Name) => ApiOf<ServerApis, Name> | undefined;
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
  /** Runs once, as the dev server starts and before it answers anything. Answers the plugin's API to the others. */
  setup?(context: ServerContext): Maybe<Api>;
  /** Routes of its own, by their first segment under `/__deictic/plugins/<name>/`. */
  routes?: { [route: string]: Route };
  /** The model its panel shows for an element. Without it, the panel gets none. */
  read?(source: Source, target: Target): Maybe<Model>;
  /** Text edits for deictic to write, or a change the plugin made itself. */
  apply?(source: Source, target: Target, op: Op): Maybe<TextEdit[] | Done<Record>>;
  /**
   * Takes back a change `apply` made itself, or throws a `Refusal` saying why it can't any more. It may
   * answer what the next redo needs, where that differs (what it put back has a new ID).
   */
  undo?(record: Record): Maybe<void | Record>;
  /** Makes it again after an undo, and answers what the next undo needs, which may differ (a new ID). */
  redo?(record: Record): Maybe<Record>;
  /** Says what an op does, for the history: `className: px-2 → px-4`. */
  describe?(op: Op, before: Model): string;
}

export const definePlugin = <Model, Op, Record = unknown, Api = unknown>(
  plugin: ServerPlugin<Model, Op, Record, Api>,
): ServerPlugin<Model, Op, Record, Api> => plugin;

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
  /**
   * Opens the popup on an element at a plugin's tab, as its shortcut would: after a recording, say. An
   * element rendered again since stands in for one no longer on the page. False when there's no such tab
   * or no such element any more. Not from `setup`, which runs before the popup can open.
   */
  open: (plugin: string, element: Element) => boolean;
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
  /** The element clicked: the one the source marked, under the pointer or around what is. */
  element: Element;
  /**
   * What was under the pointer, where it isn't `element` but inside it: markup nothing marked, as a
   * dependency's, or in an open shadow root, as the popup's own on a page that shows it (`popupIn`).
   */
  pointed?: Element;
  /** Every element on the page from the same place in the source, the clicked one among them: the rows of a list. */
  elements: Element[];
  target: Target;
  model: Model;
  /** Applies an op on disk, and reads the model again. Rejects with the server's reason, which the panel also shows. */
  apply(op: Op): Promise<Model>;
  close: () => void;
  /**
   * Leaves the popup to do something on the page, then comes back: closes it, runs `task` (a recording, a
   * pick of another element), and opens it again at this tab on this element. The next mount gets
   * `resumed`: the `state` kept now (what was typed, what's attached), and what `task` answered, or why
   * it failed. The state stays in the page, as it is: no need for JSON.
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
  /** Draws into `panel`, inside deictic's shadow root. Returns what to undo on the page when the panel closes. */
  mount?: (panel: HTMLElement, context: PanelContext<Model, Op>) => (() => void) | void;
}

export const defineClientPlugin = <Model, Op, Api = unknown>(plugin: ClientPlugin<Model, Op, Api>): ClientPlugin<Model, Op, Api> => plugin;
