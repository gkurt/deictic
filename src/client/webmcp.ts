/**
 * deictic's tools for an agent driving the browser, through WebMCP: `document.modelContext.registerTool`, Chrome's
 * (an origin trial, or a flag; agent-browser turns it on in the Chrome it launches, and finds the tools over CDP, so
 * no polyfill would reach it). Only where `deictic({ webmcp })` asks for them and the page has the API.
 *
 * deictic's own tools tie the page to the source (what's pointed at, where an element is written, the elements a
 * place renders) and undo; each plugin adds its own (`ClientPlugin.webmcp`). A `write` tool, one that changes the
 * project's files or the board, is offered only with `webmcp: { write: true }`.
 */
import type { ClientContext, ClientPlugin, Point, Problem, Target, WebContext, WebElement, WebTool } from '#src/index.ts';

import { chainOf, named, tell } from './component.ts';
import { ATTRIBUTE, markedAround, sameAs, targetOf } from './dom.ts';

export interface WebMcpOptions {
  /** Offers the tools that change the project's files or the board too (`write`): off by default. */
  write?: boolean;
}

/** What the page says is pointed at: the popup's element while it's open, else what was lit last while pointing. */
export interface Pointing {
  element: Element;
  /** What was under the pointer inside it, where that differs. */
  pointed?: Element;
  /** The spot in it the popup was opened on, where it was one. */
  at?: Point;
  /** The tab the popup is open at, while it's open. */
  tab?: string;
  /** When it was pointed at, as `Date.now()`. */
  when: number;
}

interface Core {
  base: string;
  send: (url: string, init?: RequestInit) => Promise<Response>;
  plugins: ClientPlugin[];
  contextOf: (name: string) => ClientContext;
  pointing: () => Pointing | undefined;
  report: (problem: Problem) => void;
}

/** The page's WebMCP API, as Chrome has it. */
interface ModelContext {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint?: boolean; consequentialHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ) => Promise<void> | void;
}

/** The text of an element an answer has at most. */
const TEXT = 120;
/** The elements `deictic_find` answers at most. */
const FOUND = 50;
/** A mark, `src/App.tsx:12:5`: a path with no space, a line and a column. */
const MARK = /^[^\s,>~+[\]()]+:\d+:\d+$/;

/** How the tools name an element, which `find` takes back. */
export const ELEMENT = {
  element: {
    type: 'string',
    description:
      'The element: its mark, `src/App.tsx:12:5` (`place` in what the tools answer), or a CSS selector, which stands for the nearest element around what it matches that the source marked.',
  },
  nth: { type: 'integer', minimum: 1, description: 'Which of the elements the mark or selector matches, from 1: the first by default.' },
} as const;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

const placeOf = ({ loc }: Target) => `${loc.file}:${loc.line}:${loc.column}`;

/** The marked element `element` names, or what's wrong, for the agent. */
export function findElement(element: unknown, nth: unknown = 1): Element {
  if (typeof element !== 'string' || element.trim() === '')
    throw new Error('name the element: its mark (`src/App.tsx:12:5`, as `deictic_find` answers it) or a CSS selector');
  const n = typeof nth === 'number' && Number.isInteger(nth) && nth >= 1 ? nth : 1;
  const given = element.trim();
  if (MARK.test(given)) {
    const all = document.querySelectorAll(`[${ATTRIBUTE}="${CSS.escape(given)}"]`);
    const found = all[n - 1];
    if (found !== undefined) return found;
    throw new Error(
      all.length === 0
        ? `nothing on this page is written at ${given}: deictic_find lists what a file renders here`
        : `${given} renders ${all.length} element${all.length === 1 ? '' : 's'} on this page, so there's no number ${n}`,
    );
  }
  let all: NodeListOf<Element>;
  try {
    all = document.querySelectorAll(given);
  } catch {
    throw new Error(`${given} is neither a mark (\`src/App.tsx:12:5\`) nor a CSS selector`);
  }
  const found = all[n - 1];
  if (found === undefined) throw new Error(`nothing on this page matches ${given}${n > 1 ? ` ${n} times` : ''}`);
  const marked = markedAround(found);
  if (marked === undefined)
    throw new Error(`${given} matches an element no marked one is around: it isn't written in the project's own JSX`);
  return marked;
}

export function describeElement(el: Element): WebElement {
  const target = targetOf(el);
  if (target === undefined) throw new Error(`the element has no ${ATTRIBUTE} mark`);
  const alike = sameAs(el);
  const chain = chainOf(el, target.loc.file);
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, TEXT);
  const r = el.getBoundingClientRect();
  return {
    place: placeOf(target),
    tag: target.tag,
    named: tell(named(el)),
    count: alike.length,
    nth: alike.indexOf(el) + 1,
    ...(chain.length === 0 ? {} : { chain }),
    ...(text === '' ? {} : { text }),
    box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
  };
}

/** Registers every tool, deictic's and the plugins', where the page has WebMCP. Answers what takes them away. */
export function registerTools(core: Core, options: WebMcpOptions): () => void {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (context === undefined || typeof context.registerTool !== 'function') return () => {};
  const controller = new AbortController();
  const post = async <T>(route: string, body: unknown): Promise<T> => {
    const res = await core.send(`${core.base}__deictic/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as T & { problem?: string };
    if (!res.ok) throw new Error(json.problem ?? `the dev server answered ${res.status}`);
    return json;
  };
  const targetIn = (el: Element) => {
    const target = targetOf(el);
    if (target === undefined) throw new Error(`the element has no ${ATTRIBUTE} mark`);
    return target;
  };
  const webContextOf = (name: string): WebContext => ({
    ...core.contextOf(name),
    find: findElement,
    describe: describeElement,
    read: async <Model>(el: Element) => (await post<{ model: Model }>('read', { plugin: name, target: targetIn(el) })).model,
    apply: async <Model>(el: Element, op: unknown) =>
      (await post<{ model: Model }>('apply', { plugin: name, target: targetIn(el), op })).model,
  });

  const tools: { plugin: string; tool: WebTool }[] = ownTools(core, post).map((tool) => ({ plugin: 'deictic', tool }));
  for (const plugin of core.plugins) {
    if (plugin.webmcp === undefined) continue;
    try {
      for (const tool of plugin.webmcp(webContextOf(plugin.name))) tools.push({ plugin: plugin.name, tool });
    } catch (e) {
      core.report(failedTo(plugin.name, `offer its WebMCP tools: ${messageOf(e)}`, e));
    }
  }
  const names = new Set<string>();
  for (const { plugin, tool } of tools) {
    if (tool.kind === 'write' && options.write !== true) continue;
    if (names.has(tool.name)) {
      core.report(failedTo(plugin, `offer its WebMCP tool ${tool.name}: another has that name`));
      continue;
    }
    names.add(tool.name);
    const registered = Promise.resolve().then(() =>
      context.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
          annotations: {
            readOnlyHint: tool.kind === 'read',
            ...(tool.kind === 'write' ? { consequentialHint: true } : {}),
            ...(tool.untrusted === true ? { untrustedContentHint: true } : {}),
          },
          // An error's message is what the agent reads: a plain one, with the fix, whatever was thrown.
          execute: async (input) => {
            try {
              return (await tool.execute(input ?? {})) ?? { done: true };
            } catch (e) {
              throw new Error(messageOf(e), { cause: e });
            }
          },
        },
        { signal: controller.signal },
      ),
    );
    registered.catch((e: unknown) => core.report(failedTo(plugin, `register its WebMCP tool ${tool.name}: ${messageOf(e)}`, e)));
  }
  return () => controller.abort();
}

const failedTo = (plugin: string, what: string, e?: unknown): Problem => ({
  key: `webmcp:${plugin}:${what.split(':', 1)[0]!.slice(0, 120)}`,
  kind: 'bug',
  ...(plugin === 'deictic' ? {} : { plugin }),
  message: `${plugin} failed to ${what}`,
  ...(e instanceof Error && e.stack !== undefined ? { details: e.stack } : {}),
});

/** deictic's own tools: the page and the source, and the history. */
function ownTools(core: Core, post: <T>(route: string, body: unknown) => Promise<T>): WebTool[] {
  const scoped = {
    type: 'object',
    properties: {
      plugin: { type: 'string', description: 'The plugin whose change it is: `tailwind`, `tasks`.' },
      ...ELEMENT,
    },
    required: ['plugin', 'element'],
  } as const;
  const step = (route: 'undo' | 'redo') => async (input: Record<string, unknown>) => {
    if (typeof input.plugin !== 'string') throw new Error('name the plugin whose change it is: `tailwind`, `tasks`');
    const target = targetOf(findElement(input.element, input.nth))!;
    const { change } = await post<{ change: { label: string } }>(route, { plugin: input.plugin, target });
    return { [route === 'undo' ? 'undid' : 'redid']: change.label };
  };
  return [
    {
      name: 'deictic_pointed',
      kind: 'read',
      description:
        'What the person is pointing at on the page: the element the deictic popup is open on, or else the last one they lit by holding Alt over it. `pointed` is what was under the pointer inside it, where that differs; `at` the spot in it the popup was opened on. Null where they have pointed at nothing yet.',
      execute: () => {
        const now = core.pointing();
        if (now === undefined || !now.element.isConnected) return { pointing: null };
        return {
          pointing: {
            element: describeElement(now.element),
            ...(now.pointed === undefined ? {} : { pointed: { tag: now.pointed.localName, html: now.pointed.outerHTML.slice(0, 2000) } }),
            ...(now.at === undefined ? {} : { at: now.at }),
            ...(now.tab === undefined ? { popup: false } : { popup: true, tab: now.tab }),
            secondsAgo: Math.round((Date.now() - now.when) / 1000),
          },
        };
      },
    },
    {
      name: 'deictic_locate',
      kind: 'read',
      description:
        'Where an element on the page is written in the source: its `place` (`file:line:column` of its opening tag), the components it rendered through (`chain`), how many elements that place renders, and its box in the window.',
      inputSchema: { type: 'object', properties: { ...ELEMENT }, required: ['element'] },
      execute: (input) => describeElement(findElement(input.element, input.nth)),
    },
    {
      name: 'deictic_find',
      kind: 'read',
      description: `The elements on the page that a place in the source renders: a file (from the project's root, \`src/App.tsx\`), and a line or a component's name to narrow it, or text they hold. ${FOUND} at most, in the page's order.`,
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: "From the project's root, with `/`: `src/App.tsx`. Its end is enough: `App.tsx`." },
          line: { type: 'integer', minimum: 1 },
          component: { type: 'string', description: 'The React component whose JSX has them: `PlanCard`.' },
          text: { type: 'string', description: 'Text they hold, in any case.' },
        },
      },
      execute: (input) => {
        const { file, line, component, text } = input as { file?: unknown; line?: unknown; component?: unknown; text?: unknown };
        if (file === undefined && component === undefined && text === undefined) throw new Error('give a file, a component or some text');
        const words = typeof text === 'string' ? text.toLowerCase() : undefined;
        const found: WebElement[] = [];
        let more = 0;
        for (const el of document.querySelectorAll(`[${ATTRIBUTE}]`)) {
          const target = targetOf(el);
          if (target === undefined) continue;
          const { loc } = target;
          if (typeof file === 'string' && loc.file !== file && !loc.file.endsWith(`/${file.replace(/^\.?\//, '')}`)) continue;
          if (typeof line === 'number' && loc.line !== line) continue;
          if (typeof component === 'string' && named(el).component !== component) continue;
          if (words !== undefined && !(el.textContent ?? '').toLowerCase().includes(words)) continue;
          if (found.length < FOUND) found.push(describeElement(el));
          else more++;
        }
        return { elements: found, ...(more === 0 ? {} : { more }) };
      },
    },
    {
      name: 'deictic_history',
      kind: 'read',
      description:
        "The changes deictic made from the page (a plugin's on an element, or all of them), oldest first: `done`, which undo takes back from the last, and `undone`, which redo makes again.",
      inputSchema: { type: 'object', properties: { ...scoped.properties } },
      execute: async (input) => {
        const query = new URLSearchParams();
        if (typeof input.plugin === 'string' && input.element !== undefined) {
          const { loc } = targetOf(findElement(input.element, input.nth))!;
          query.set('plugin', input.plugin);
          query.set('file', loc.file);
          query.set('line', String(loc.line));
          query.set('column', String(loc.column));
        }
        const res = await core.send(`${core.base}__deictic/history?${query}`);
        if (!res.ok) throw new Error(`the dev server answered ${res.status}`);
        return await res.json();
      },
    },
    {
      name: 'deictic_undo',
      kind: 'write',
      description: "Takes back a plugin's latest change on an element (a class edit, a task added), as the popup's undo does.",
      inputSchema: scoped,
      execute: step('undo'),
    },
    {
      name: 'deictic_redo',
      kind: 'write',
      description: "Makes a plugin's latest undone change on an element again, as the popup's redo does.",
      inputSchema: scoped,
      execute: step('redo'),
    },
  ];
}
