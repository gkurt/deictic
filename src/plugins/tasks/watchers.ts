/**
 * Who watches the channel for tasks. A board can't say (it knows who claimed a task, not who's listening), so a
 * watch says it itself: the skill's `watch.mjs` keeps a file under `.deictic/watchers` while it runs, written
 * again every 20 seconds, and the Task tab shows the names, so a person knows whether a task they add is taken up.
 * (An agent holding a claim is one more, which the board does say: `agentsOf`, in `index.ts`.)
 */
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { keptIn } from '#src/tools/kept.ts';

/** How old a watch's last word may be: three of its beats, as one killed says nothing more. */
const FRESH = 60_000;

/** The names watching `channel` from this project now, each once, in order. */
export function watchersOf(root: string, channel: string, now = Date.now()): string[] {
  const dir = keptIn(root, 'watchers');
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  const names = new Set<string>();
  for (const file of files) {
    const path = join(dir, file);
    try {
      const { name, channel: of, at } = JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown; channel?: unknown; at?: unknown };
      if (typeof at !== 'number' || now - at > FRESH) rmSync(path, { force: true });
      else if (of === channel && typeof name === 'string') names.add(name);
    } catch {
      // Half written: whole by the next read.
    }
  }
  return [...names].sort();
}
