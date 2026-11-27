/**
 * The react plugin's page half: what React's DevTools would show of the components that wrote an element, read off
 * its fibers with bippy (an optional peer, imported as a task first asks for it), for a task to attach.
 */
import type * as Main from 'bippy';
import type * as Source from 'bippy/source';

import { componentOf, fiberOf, type Owner, ownerOf, parentOf } from '#src/client/component.ts';
import { ELEMENT } from '#src/client/webmcp.ts';
import { defineClientPlugin } from '#src/index.ts';

import type { Commit, Component, Hook, ReactOptions, Snapshot } from './index.ts';
import { countRenders, type Fiber } from './renders.ts';
import { serialize } from './serialize.ts';
import { timeline } from './timeline.ts';

/** What a task asks of the plugin, and a recording. */
export interface Inspector {
  /** The snapshot of the element's components, as the JSON a task attaches: `undefined` where React didn't render it in development. */
  snapshot(el: Element): Promise<string | undefined>;
  /**
   * React's commits from now, an entry a frame (`emit` hears each), until what's answered stops it: for a recording.
   * `undefined` where renders aren't counted (`renders: false`, or no DevTools hook on the page).
   */
  commits?: (emit: (commit: Commit) => void) => () => void;
}

declare module 'deictic' {
  interface ClientApis {
    react: Inspector;
  }
}

/** How long hook names may take: their source, and its map, are fetched from the dev server. */
const NAMES_WAIT = 3000;
/** What's attached at most, in characters: a page's values may be its whole store. */
const MOST = 200_000;

/** Hooks whose values are functions to run, which say nothing of what the component shows. */
const SILENT = new Set(['Effect', 'LayoutEffect', 'InsertionEffect', 'ImperativeHandle', 'EffectEvent']);

type Bippy = typeof Main & typeof Source;

let loading: Promise<Bippy> | undefined;

/**
 * bippy, with a renderer to inspect hooks through. React hands its renderer to DevTools' hook as it loads, which
 * React Refresh (Vite's, Next's) installs first in development; where nothing did, the page's React is asked for its
 * dispatcher, which is all hook inspection needs of one.
 */
const bippy = (): Promise<Bippy> =>
  (loading ??= (async () => {
    const [main, source] = await Promise.all([import('bippy'), import('bippy/source')]).catch((e: unknown) => {
      loading = undefined;
      throw new Error('react needs bippy: add it to your devDependencies', { cause: e });
    });
    if (main.getRDTHook().renderers.size === 0 && main._renderers.size === 0) {
      const React = (await import('react')) as unknown as Record<string, unknown>;
      const internals = (React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ??
        (React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as { ReactCurrentDispatcher?: unknown } | undefined)
          ?.ReactCurrentDispatcher) as { H: unknown } | { current: unknown } | undefined;
      if (internals !== undefined) main._renderers.add({ currentDispatcherRef: internals } as never);
    }
    return { ...main, ...source };
  })());

/** `src/Plan.tsx:12`: where the nearest element around `el` that `owner` wrote is, which is in its JSX. */
function placeOf(el: Element, owner: Owner): string | undefined {
  for (let at: Element | undefined = el; at !== undefined; at = parentOf(at)) {
    const by = ownerOf(fiberOf(at));
    // A component's fiber is one of two, by turns: an element may name either.
    if (by === undefined || (by !== owner && by !== owner.alternate)) continue;
    const mark = at.getAttribute('data-deictic');
    if (mark !== null) return mark.replace(/:\d+$/, '');
  }
  return undefined;
}

export default defineClientPlugin<never, never, Inspector>({
  name: 'react',
  webmcp: ({ use, find }) => [
    {
      name: 'react_state',
      kind: 'read',
      untrusted: true,
      description:
        "What React's DevTools would show of an element: the component that wrote it and the ones that wrote that, out, each with its props, its state or hooks (named as the code names them), and how often it rendered, how long that took and why. Values the page holds, masked by name (tokens, passwords) and cut where long. Null where React didn't render it in development.",
      inputSchema: { type: 'object', properties: { ...ELEMENT }, required: ['element'] },
      execute: async (input) => {
        const inspector = use('react');
        if (inspector === undefined) throw new Error('the react plugin did not set up in the page');
        const json = await inspector.snapshot(find(input.element, input.nth));
        return json === undefined ? { components: null } : (JSON.parse(json) as unknown);
      },
    },
  ],
  setup: ({ options }) => {
    const { components = 4, mask = [], names = true, renders = true } = (options ?? {}) as ReactOptions;
    // From now, before any task: what rendered before the page started deictic goes uncounted.
    const counted = renders ? countRenders() : undefined;
    const value = (of: unknown) => serialize(of, mask);

    /** A hook as DevTools lists it: its kind (`State`, or a custom hook's name less `use`), what the code calls it, its value. */
    const hookOf = (node: Source.HooksNode, named: Map<string, string>): Hook | undefined => {
      if (SILENT.has(node.name)) return undefined;
      const { fileName, lineNumber, columnNumber } = node.hookSource ?? {};
      const as = fileName ? named.get(`${fileName}:${lineNumber ?? 0}:${columnNumber ?? 0}`) : undefined;
      const inner = node.subHooks.flatMap((sub) => hookOf(sub, named) ?? []);
      const read = node.subHooks.length > 0 && node.value === undefined ? undefined : value(node.value);
      return {
        hook: node.name,
        ...(as === undefined ? {} : { as }),
        ...(read === undefined ? {} : { value: read }),
        ...(inner.length === 0 ? {} : { hooks: inner }),
      };
    };

    return {
      ...(counted === undefined ? {} : { commits: (emit: (commit: Commit) => void) => timeline(counted.subscribe, emit) }),
      snapshot: async (el) => {
        const wrote = ownerOf(fiberOf(el));
        if (wrote === undefined) return undefined;
        const b = await bippy();
        const found: Component[] = [];
        for (let owner: Owner | undefined = wrote; owner !== undefined && found.length < components; owner = ownerOf(owner)) {
          const name = componentOf(owner) ?? 'Anonymous';
          // A server component: it has a name and no fiber, so no props or state the page holds.
          if (typeof owner.name === 'string') {
            found.push({ name, server: true });
            continue;
          }
          const fiber = b.getLatestFiber(owner as never) as unknown as Owner & {
            memoizedProps?: unknown;
            memoizedState?: unknown;
            stateNode?: { state?: unknown } | null;
          };
          const at = placeOf(el, owner);
          const component: Component = { name, ...(at === undefined ? {} : { at }) };
          const props = value(fiber.memoizedProps);
          if (props !== undefined) component.props = props;
          const rendered = counted?.read(fiber as unknown as Fiber);
          if (rendered !== undefined) component.renders = rendered;
          // A class's state is its instance's; a function's is its hooks.
          if (fiber.stateNode !== null && typeof fiber.stateNode === 'object' && 'state' in fiber.stateNode) {
            const state = value(fiber.stateNode.state);
            if (state !== undefined) component.state = state;
          } else {
            try {
              const tree = b.getFiberHooks(fiber as never);
              let named = new Map<string, string>();
              if (names && tree.length > 0) {
                // Read off the source, which may not answer: the hooks go unnamed then.
                named = await b.parseHookNames(tree, undefined, { timeoutMs: NAMES_WAIT }).catch(() => new Map());
              }
              const hooks = tree.flatMap((node) => hookOf(node, named) ?? []);
              if (hooks.length > 0) component.hooks = hooks;
            } catch (e) {
              component.problem = `its hooks couldn't be read: ${e instanceof Error ? e.message : String(e)}`;
            }
          }
          found.push(component);
        }
        if (found.length === 0) return undefined;
        const snapshot: Snapshot = { components: found };
        const json = JSON.stringify(snapshot, null, 2);
        if (json.length <= MOST) return json;
        // Too much: the nearest component's alone, the one that wrote the element.
        const less = JSON.stringify({ components: found.slice(0, 1) } satisfies Snapshot, null, 2);
        return less.length <= MOST ? less : `${less.slice(0, MOST)}\n… cut short`;
      },
    };
  },
});
