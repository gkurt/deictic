/**
 * How often each component rendered, how long it took and why, as React's DevTools profiler tells it: each commit
 * React hands DevTools' hook (`onCommitFiberRoot`) is walked for the components it rendered. The hook is React
 * Refresh's in development (Vite's, Next's, webpack's and Rspack's), which React found as it loaded, and calls on
 * every commit whoever answers it later: so it's counted from when deictic's page half starts, not from the page's
 * first render.
 */
import type { Renders } from './index.ts';

/** What a fiber holds that this reads: React's own, in development. */
export interface Fiber {
  tag: number;
  flags?: number;
  alternate: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  memoizedProps?: unknown;
  memoizedState?: unknown;
  dependencies?: { firstContext?: Dependency | null } | null;
  /** In profiling mode, which React is in where DevTools' hook was there as it loaded: this render, with what's under it. */
  actualDuration?: number;
  /** And its own part of it. */
  selfBaseDuration?: number;
  /** The component, or a host element's tag. */
  type?: unknown;
  /** Who wrote it, in development. */
  _debugOwner?: Fiber | null;
  /** A host element's DOM node. */
  stateNode?: unknown;
}

/** A component that rendered in a commit: its timings as they were then, as the next render overwrites a fiber's. */
export interface RenderedFiber {
  fiber: Fiber;
  why: string;
  ms?: number;
  selfMs?: number;
}

/** A commit, as it was made: for whoever listens to them (a recording's timeline). */
export interface Rendering {
  /** The whole commit's render, in milliseconds, where React times it. */
  ms?: number;
  /** React's scheduler priority for it. */
  priority?: number;
  rendered: RenderedFiber[];
}

interface Dependency {
  memoizedValue?: unknown;
  next?: Dependency | null;
}

/** A hook of a function component: React keeps them as a list. */
interface HookNode {
  memoizedState?: unknown;
  next?: HookNode | null;
}

/** Function, class, `forwardRef` and simple `memo` components: those that render (a `memo` wrapper's is its child). */
const COMPOSITE = new Set([0, 1, 11, 15]);
const CLASS = 1;
/** React's flag for a fiber whose component ran in this render, rather than bailed out. */
const PERFORMED_WORK = 1;
/** How many render times are kept per component, for how many were recent. */
const KEPT = 100;
/** What's recent: renders this long before a task, a loop or a burst. */
export const RECENT = 10_000;
/** How many changed props a reason names. */
const NAMED = 10;

interface Stats {
  count: number;
  at: number[];
  lastMs?: number;
  selfMs?: number;
  why: string;
}

/** A hook's state that's an effect: a new one each render, which says nothing changed. */
const isEffect = (state: unknown) => typeof state === 'object' && state !== null && 'create' in state && 'tag' in state;

/** Why `next` rendered, `prev` being what it was: its props, its state, a context, or its parent rendering it again. */
export function whyOf(next: Fiber, prev: Fiber | null): string {
  if (prev === null) return 'mounted';
  const reasons: string[] = [];
  if (next.memoizedProps !== prev.memoizedProps) {
    const before = (prev.memoizedProps ?? {}) as Record<string, unknown>;
    const now = (next.memoizedProps ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(before), ...Object.keys(now)])].filter((k) => !Object.is(before[k], now[k]));
    if (keys.length > 0)
      reasons.push(`props changed: ${keys.slice(0, NAMED).join(', ')}${keys.length > NAMED ? ` and ${keys.length - NAMED} more` : ''}`);
  }
  if (stateChanged(next, prev)) reasons.push('state changed');
  if (contextChanged(next, prev)) reasons.push('context changed');
  // Props of a new object with the same values: what a parent passes each time it renders.
  return reasons.length > 0 ? reasons.join('; ') : 'its parent rendered';
}

function stateChanged(next: Fiber, prev: Fiber): boolean {
  if (next.memoizedState === prev.memoizedState) return false;
  if (next.tag === CLASS) return true;
  let a = prev.memoizedState as HookNode | null | undefined;
  let b = next.memoizedState as HookNode | null | undefined;
  for (; a != null && b != null; a = a.next, b = b.next) {
    if (Object.is(a.memoizedState, b.memoizedState) || isEffect(b.memoizedState)) continue;
    return true;
  }
  return false;
}

function contextChanged(next: Fiber, prev: Fiber): boolean {
  let a = prev.dependencies?.firstContext;
  let b = next.dependencies?.firstContext;
  for (; a != null && b != null; a = a.next, b = b.next) if (!Object.is(a.memoizedValue, b.memoizedValue)) return true;
  return false;
}

/** The stats of every component the page rendered since it started being counted, read by its fiber, either of its two. */
export function renderStats(now: () => number = () => performance.now()) {
  const stats = new WeakMap<Fiber, Stats>();

  const listeners = new Set<(commit: Rendering) => void>();

  const record = (fiber: Fiber, prev: Fiber | null): RenderedFiber => {
    const kept = stats.get(fiber) ?? (fiber.alternate === null ? undefined : stats.get(fiber.alternate));
    const entry: Stats = kept ?? { count: 0, at: [], why: '' };
    entry.count++;
    entry.at.push(now());
    if (entry.at.length > KEPT) entry.at.shift();
    entry.why = whyOf(fiber, prev);
    if (typeof fiber.actualDuration === 'number') entry.lastMs = fiber.actualDuration;
    if (typeof fiber.selfBaseDuration === 'number') entry.selfMs = fiber.selfBaseDuration;
    stats.set(fiber, entry);
    if (fiber.alternate !== null) stats.set(fiber.alternate, entry);
    return {
      fiber,
      why: entry.why,
      ...(typeof fiber.actualDuration === 'number' ? { ms: fiber.actualDuration } : {}),
      ...(typeof fiber.selfBaseDuration === 'number' ? { selfMs: fiber.selfBaseDuration } : {}),
    };
  };

  /** A committed tree, from its root's current fiber: what was rendered in it, and nothing React left as it was. */
  const commit = (root: Fiber, priority?: number) => {
    const rendered: RenderedFiber[] = [];
    const stack: Fiber[] = [];
    for (let child = root.child; child !== null; child = child.sibling) stack.push(child);
    while (stack.length > 0) {
      const fiber = stack.pop()!;
      const prev = fiber.alternate;
      if ((prev === null || ((fiber.flags ?? 0) & PERFORMED_WORK) !== 0) && COMPOSITE.has(fiber.tag)) rendered.push(record(fiber, prev));
      // Children React didn't clone weren't rendered, nor anything under them.
      if (prev !== null && fiber.child === prev.child) continue;
      for (let child = fiber.child; child !== null; child = child.sibling) stack.push(child);
    }
    if (listeners.size === 0) return;
    const made: Rendering = {
      rendered,
      ...(typeof root.actualDuration === 'number' ? { ms: root.actualDuration } : {}),
      ...(priority === undefined ? {} : { priority }),
    };
    for (const listen of listeners) listen(made);
  };

  /** Hears each commit from now, until what's answered stops it. */
  const subscribe = (listen: (commit: Rendering) => void) => {
    listeners.add(listen);
    return () => void listeners.delete(listen);
  };

  const read = (fiber: Fiber): Renders | undefined => {
    const entry = stats.get(fiber) ?? (fiber.alternate === null ? undefined : stats.get(fiber.alternate));
    if (entry === undefined) return undefined;
    const at = now();
    const round = (ms: number) => Math.round(ms * 100) / 100;
    return {
      count: entry.count,
      recent: entry.at.filter((t) => at - t <= RECENT).length,
      lastAgo: Math.round(at - entry.at.at(-1)!),
      ...(entry.lastMs === undefined ? {} : { lastMs: round(entry.lastMs) }),
      ...(entry.selfMs === undefined ? {} : { selfMs: round(entry.selfMs) }),
      why: entry.why,
    };
  };

  return { commit, read, subscribe };
}

/** DevTools' hook, as React calls it. */
interface Hook {
  onCommitFiberRoot?: (id: number, root: { current: Fiber }, priority?: number, ...rest: unknown[]) => unknown;
}

/**
 * Counts every commit from now on, where the page has DevTools' hook: answers what reads the counts and what hears
 * each commit, or nothing where
 * there's no hook (React then calls nothing, and keeps no timings either). The hook's own handler (React Refresh's,
 * or the DevTools extension's) goes on being called first.
 */
export function countRenders(target: { __REACT_DEVTOOLS_GLOBAL_HOOK__?: Hook } = globalThis as never) {
  const hook = target.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook === undefined) return undefined;
  const counts = renderStats();
  let warned = false;
  const before = hook.onCommitFiberRoot;
  hook.onCommitFiberRoot = function (this: unknown, id, root, priority, ...rest) {
    const answer = before?.call(this, id, root, priority, ...rest);
    try {
      counts.commit(root.current, priority);
    } catch (e) {
      // Never the page's render: a fiber of a React this doesn't know. Said once, not on each commit.
      if (!warned) console.warn("deictic: renders aren't counted on this page", e);
      warned = true;
    }
    return answer;
  };
  return { read: counts.read, subscribe: counts.subscribe };
}
