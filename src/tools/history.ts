/**
 * Every change deictic made, to undo and redo. A change to files holds each file's whole text
 * before and after: source files are small, and the texts make undo exact without a diff to go stale.
 * A change a plugin made itself (`Done`) holds the plugin's name and its record, and undoing it is the
 * plugin's `undo`.
 *
 * Undo only puts back a file still as deictic left it. One edited since in the editor is refused,
 * not merged, as the editor has its own undo for it; and a redo likewise. A plugin's undo refuses on
 * its own terms. Kept under `.deictic`, so it outlives a restart of the dev server and
 * stays out of git.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { Refusal, type ServerPlugin } from '#src/index.ts';

import { keptIn } from './kept.ts';
import { resolveFile } from './source.ts';

export interface FileChange {
  file: string;
  /** The text before, or nothing for a file the change made. */
  before: string | null;
  after: string;
}

interface Base {
  id: number;
  at: string;
  label: string;
}

export type Change = Base & ({ files: FileChange[] } | { plugin: string; record: unknown });

/** A change as the page lists it. `files` is empty for one a plugin made itself. */
export interface Summary {
  id: number;
  at: string;
  label: string;
  files: string[];
}

export interface HistoryOptions {
  /** Whose `undo` and `redo` take back the changes they made themselves. */
  plugins?: ServerPlugin[];
  store?: string;
}

const LIMIT = 200;

const summary = (c: Change): Summary => ({ id: c.id, at: c.at, label: c.label, files: 'files' in c ? c.files.map((f) => f.file) : [] });

export class History {
  #done: Change[] = [];
  #undone: Change[] = [];
  readonly #root: string;
  readonly #store: string;
  readonly #plugins: Map<string, ServerPlugin>;

  constructor(root: string, { plugins = [], store = keptIn(root, 'history.json') }: HistoryOptions = {}) {
    this.#root = root;
    this.#store = store;
    this.#plugins = new Map(plugins.map((p) => [p.name, p]));
    if (!existsSync(store)) return;
    try {
      ({ done: this.#done, undone: this.#undone } = JSON.parse(readFileSync(store, 'utf8')) as { done: Change[]; undone: Change[] });
    } catch {
      // A history that doesn't read is one we start over, not one to stop the dev server for.
    }
  }

  /** Writes each file's new text and records it as one change. A redo after it is gone, as in any editor. */
  commit(label: string, texts: Map<string, string>): Summary {
    const files: FileChange[] = [];
    for (const [file, after] of texts) {
      const path = resolveFile(this.#root, file);
      const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
      if (before !== after) files.push({ file, before, after });
    }
    if (files.length === 0) throw new Refusal('nothing to change: the source already says that');
    for (const f of files) write(resolveFile(this.#root, f.file), f.after);
    return this.#push({ label, files });
  }

  /** Records a change `plugin` made itself, with what its `undo` needs. */
  record(label: string, plugin: string, record: unknown): Summary {
    return this.#push({ label, plugin, record });
  }

  async undo(): Promise<Summary> {
    const change = this.#done.at(-1);
    if (change === undefined) throw new Refusal('nothing to undo');
    if ('files' in change) this.#put(change, 'after', 'before');
    else await this.#pluginOf(change, 'undo').undo!(change.record);
    this.#done.pop();
    this.#undone.push(change);
    this.#save();
    return summary(change);
  }

  async redo(): Promise<Summary> {
    const change = this.#undone.at(-1);
    if (change === undefined) throw new Refusal('nothing to redo');
    if ('files' in change) this.#put(change, 'before', 'after');
    else change.record = await this.#pluginOf(change, 'redo').redo!(change.record);
    this.#undone.pop();
    this.#done.push(change);
    this.#save();
    return summary(change);
  }

  list(): { done: Summary[]; undone: Summary[] } {
    return { done: this.#done.map(summary), undone: this.#undone.map(summary) };
  }

  #push(change: Omit<Base, 'id' | 'at'> & ({ files: FileChange[] } | { plugin: string; record: unknown })): Summary {
    const id = Math.max(0, ...[...this.#done, ...this.#undone].map((c) => c.id)) + 1;
    const made = { id, at: new Date().toISOString(), ...change };
    this.#done = [...this.#done, made].slice(-LIMIT);
    this.#undone = [];
    this.#save();
    return summary(made);
  }

  #pluginOf(change: { label: string; plugin: string }, step: 'undo' | 'redo'): ServerPlugin {
    const plugin = this.#plugins.get(change.plugin);
    if (plugin?.[step] === undefined) {
      throw new Refusal(
        `can't ${step} "${change.label}": the ${change.plugin} plugin that made it isn't loaded, so add it back to \`plugins\``,
      );
    }
    return plugin;
  }

  /** Puts each file's `to` text back, once every one of them still reads as its `from`. */
  #put(change: Base & { files: FileChange[] }, from: 'before' | 'after', to: 'before' | 'after'): void {
    const paths = change.files.map((f) => resolveFile(this.#root, f.file));
    change.files.forEach((f, i) => {
      const now = existsSync(paths[i]!) ? readFileSync(paths[i]!, 'utf8') : null;
      if (now !== f[from]) {
        throw new Refusal(
          `${f.file} changed since "${change.label}" ${from === 'after' ? 'was made' : 'was undone'}: use the editor's undo there`,
        );
      }
    });
    change.files.forEach((f, i) => {
      const text = f[to];
      if (text === null) rmSync(paths[i]!);
      else write(paths[i]!, text);
    });
  }

  #save(): void {
    write(this.#store, JSON.stringify({ done: this.#done, undone: this.#undone }));
  }
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
