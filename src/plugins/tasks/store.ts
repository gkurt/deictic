/**
 * The channel's tasks as the page has them: read once for the pins and the drop zone both, and again when one of
 * them changes a task. And which of them have something unread: a reply since the task was last opened here, or an
 * end no one has looked at. What's been read is the browser's to keep, as a board keeps it for no one.
 */
import type { ClientContext } from '#src/index.ts';

import type { Listed } from './index.ts';

/** How long the tasks read last are shown as they are, in ms: the keys are held again and again, and each is no reason to ask the board. */
const FRESH = 4000;
/** Where what's been read is kept: each task's ID, and how its thread stood when it was last opened. */
const SEEN = 'deictic:tasks:seen';
/** The states of a task that's over, as a board names them: nothing more happens to it. */
export const OVER = new Set(['completed', 'failed']);
/** The states whose coming is news in itself, whoever said nothing as it came. */
const NEWS = new Set(['blocked', 'completed', 'failed']);

export interface Store {
  /** The tasks as read last: those still to do, oldest first, then those lately over. */
  tasks: () => Listed[];
  /** The channel, and its page on the board where there's one to link to: nothing before the first read. */
  channel: () => { name: string; link?: string } | undefined;
  /** Reads them again, unless they were a moment ago: `again` whatever, after a change made here. */
  load: (again?: boolean) => void;
  /** Hears each read; answers what stops it. */
  subscribe: (listener: () => void) => () => void;
  /** Whether a task has something no one has read here. */
  unread: (task: Listed) => boolean;
  /** The reply that was its newest when it was last read here, where it had one. */
  read: (task: Listed) => string | undefined;
  /** Says a task is read, as its thread stands. */
  seen: (task: Listed) => void;
}

/** How a task's thread stands: its newest reply, and its state where that's news. */
const markOf = (task: Listed) => `${task.last ?? ''}|${NEWS.has(task.state) ? task.state : ''}`;

/** What's been read, or nothing where this browser has kept none yet. */
function kept(): Record<string, string> | undefined {
  try {
    const seen: unknown = JSON.parse(localStorage.getItem(SEEN) ?? 'null');
    return typeof seen === 'object' && seen !== null ? (seen as Record<string, string>) : undefined;
  } catch {
    // Storage can be off, or hold something else: nothing's been kept, then.
    return undefined;
  }
}

const made = new WeakMap<ShadowRoot, Store>();

/** The tasks of the overlay `context` is of: one store, whoever asks. */
export function storeOf(context: ClientContext): Store {
  const known = made.get(context.root);
  if (known !== undefined) return known;

  let tasks: Listed[] = [];
  let channel: { name: string; link?: string } | undefined;
  let read = 0;
  let asked = 0;
  let seen = kept();
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const listener of listeners) listener();
  };
  const keep = () => {
    try {
      localStorage.setItem(SEEN, JSON.stringify(seen));
    } catch {
      // Not kept past the page, then.
    }
  };

  const store: Store = {
    tasks: () => tasks,
    channel: () => channel,
    load: (again = false) => {
      if (!again && Date.now() - read < FRESH) return;
      const ask = ++asked;
      read = Date.now();
      void context
        .request('page')
        .then(async (res) => {
          if (!res.ok || ask !== asked) return;
          const answer = (await res.json()) as { channel?: string; link?: string; tasks: Listed[] };
          ({ tasks } = answer);
          // The first read in this browser: what the channel has by now is old news, and only what comes after is unread.
          if (seen === undefined) {
            seen = Object.fromEntries(tasks.map((task) => [task.id, markOf(task)]));
            keep();
          }
          if (answer.channel !== undefined) channel = { name: answer.channel, ...(answer.link === undefined ? {} : { link: answer.link }) };
          tell();
        })
        // As they were, then: whatever opens a task says why the board can't be reached.
        .catch(() => {});
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    unread: (task) => seen !== undefined && markOf(task) !== '|' && seen[task.id] !== markOf(task),
    read: (task) => seen?.[task.id]?.split('|', 1)[0] || undefined,
    seen: (task) => {
      if (seen?.[task.id] === markOf(task)) return;
      // Another tab may have read others since: theirs are kept too.
      seen = { ...seen, ...kept(), [task.id]: markOf(task) };
      keep();
      tell();
    },
  };
  made.set(context.root, store);
  return store;
}
