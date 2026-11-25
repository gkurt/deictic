/**
 * React's commits as a timeline, for a recording: what DevTools' profiler shows of each commit, cut to what reads in
 * a list. Commits a frame apart are one entry (an animation commits each frame), each names the components that
 * rendered in it, the slowest first, and past `RATE` entries a second only a slow one names them: a recording is
 * kept as it goes, and a page that renders without stop would fill it.
 */
import { componentOf } from '#src/client/component.ts';

import type { Commit, Rendered } from './index.ts';
import type { Fiber, Rendering } from './renders.ts';

/** Commits closer than this are one entry, in milliseconds: a frame. */
export const FRAME = 16;
/** How many components an entry names, the slowest first. */
const NAMED = 20;
/** How many entries a second name their components; past that, only those slower than a frame. */
const RATE = 10;
/** How far down a component a host element it wrote is looked for, in fibers. */
const LOOKED = 200;

/** React's scheduler priorities, as `onCommitFiberRoot` is given them. */
const PRIORITIES: Record<number, string> = { 1: 'immediate', 2: 'user-blocking', 3: 'normal', 4: 'low', 5: 'idle' };

/** `src/Plan.tsx:12`: the first host element under `fiber` that it wrote, where the page marks it. */
function placeOf(fiber: Fiber): string | undefined {
  const its = (by: Fiber | null | undefined) => by != null && (by === fiber || by === fiber.alternate);
  const stack: Fiber[] = fiber.child === null ? [] : [fiber.child];
  for (let looked = 0; stack.length > 0 && looked < LOOKED; looked++) {
    const at = stack.pop()!;
    if (at.sibling !== null) stack.push(at.sibling);
    if (typeof at.type === 'string' && its(at._debugOwner)) {
      const mark = (at.stateNode as Element | null)?.getAttribute?.('data-deictic');
      if (typeof mark === 'string') return mark.replace(/:\d+$/, '');
    }
    if (at.child !== null) stack.push(at.child);
  }
  return undefined;
}

const round = (ms: number) => Math.round(ms * 100) / 100;

/** One entry of commits a frame apart: the components that rendered, each once with how often, the slowest first. */
export function summarize(commits: Rendering[], named: boolean): Commit {
  const by = new Map<string, Rendered & { order: number }>();
  for (const { rendered } of commits) {
    for (const { fiber, why, ms, selfMs } of rendered) {
      const name = componentOf(fiber) ?? 'Anonymous';
      const at = placeOf(fiber);
      const key = `${name} ${at ?? ''}`;
      const seen = by.get(key);
      const entry = seen ?? { name, ...(at === undefined ? {} : { at }), count: 0, why, order: by.size };
      entry.count = (entry.count ?? 0) + 1;
      entry.why = why;
      if (ms !== undefined) entry.ms = round((entry.ms ?? 0) + ms);
      if (selfMs !== undefined) entry.selfMs = round((entry.selfMs ?? 0) + selfMs);
      by.set(key, entry);
    }
  }
  // The slowest first, and those alike in the order they rendered.
  const all = [...by.values()].sort((a, b) =>
    (b.selfMs ?? 0) - (a.selfMs ?? 0) !== 0 ? (b.selfMs ?? 0) - (a.selfMs ?? 0) : a.order - b.order,
  );
  const kept = named ? all.slice(0, NAMED) : [];
  const ms = commits.reduce<number | undefined>((sum, c) => (c.ms === undefined ? sum : (sum ?? 0) + c.ms), undefined);
  const priority = commits.at(-1)?.priority;
  return {
    commits: commits.length,
    ...(ms === undefined ? {} : { ms: round(ms) }),
    ...(priority === undefined || PRIORITIES[priority] === undefined ? {} : { priority: PRIORITIES[priority] }),
    components: kept.map(({ order: _, count, ...rest }) => ({ ...rest, ...(count !== undefined && count > 1 ? { count } : {}) })),
    ...(all.length > kept.length ? { more: all.length - kept.length } : {}),
  };
}

/**
 * Listens to the commits `subscribe` gives, and answers each frame's as one entry: `emit` hears them, until what's
 * answered stops it (what's waiting goes first).
 */
export function timeline(
  subscribe: (listen: (commit: Rendering) => void) => () => void,
  emit: (commit: Commit) => void,
  clock: { now: () => number; later: (run: () => void, ms: number) => unknown } = {
    now: () => performance.now(),
    later: (run, ms) => setTimeout(run, ms),
  },
): () => void {
  let waiting: Rendering[] = [];
  let second = 0;
  let inSecond = 0;
  const flush = () => {
    const commits = waiting;
    waiting = [];
    if (commits.length === 0) return;
    const now = clock.now();
    if (now - second >= 1000) {
      second = now;
      inSecond = 0;
    }
    inSecond++;
    const ms = commits.reduce((sum, c) => sum + (c.ms ?? 0), 0);
    emit(summarize(commits, inSecond <= RATE || ms > FRAME));
  };
  const unsubscribe = subscribe((commit) => {
    if (waiting.length === 0) clock.later(flush, FRAME);
    waiting.push(commit);
  });
  return () => {
    unsubscribe();
    flush();
  };
}
