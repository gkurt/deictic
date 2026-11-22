/**
 * Who watches the channel for tasks. A board can't say (it knows who claimed a task, not who's listening), so a
 * watch says it itself: `deictic watch` keeps a file under `.deictic/watchers` while it runs (`watcherAt`), written
 * again every `BEAT`, and the Task tab shows the names, so a person knows whether a task they add is taken up.
 * (An agent holding a claim is one more, which the board does say: `agentsOf`, in `index.ts`.)
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { keptIn } from '#src/tools/kept.ts';

/** How often a watch says it's still there, and so how soon the page knows of one that was killed (three missed). */
export const BEAT = 20_000;
/** How old a watch's last word may be: three of its beats, as one killed says nothing more. */
const FRESH = 3 * BEAT;

/** What a watch keeps in a `.deictic/watchers` while it runs: one file per process. */
export interface Watcher {
  name: string;
  channel: string;
  pid: number;
  at: number;
}

/**
 * A watch's file in each of `dirs` (`.deictic/` folders), written now and again every `BEAT`. Answers what takes
 * it back, as the watch ends.
 */
export function watcherAt(dirs: readonly string[], name: string, channel: string): () => void {
  const files = dirs.map((dir) => join(dir, 'watchers', `${process.pid}.json`));
  const beat = () => {
    const watcher: Watcher = { name, channel, pid: process.pid, at: Date.now() };
    for (const file of files) {
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, `${JSON.stringify(watcher)}\n`);
      } catch {
        // A folder that can't be written to: the watch goes on, unseen.
      }
    }
  };
  beat();
  const timer = setInterval(beat, BEAT);
  return () => {
    clearInterval(timer);
    for (const file of files) rmSync(file, { force: true });
  };
}

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
      const { name, channel: of, at } = JSON.parse(readFileSync(path, 'utf8')) as Partial<Watcher>;
      if (typeof at !== 'number' || now - at > FRESH) rmSync(path, { force: true });
      else if (of === channel && typeof name === 'string') names.add(name);
    } catch {
      // Half written: whole by the next read.
    }
  }
  return [...names].sort();
}
