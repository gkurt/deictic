/**
 * Every change deictic made, to undo and redo. A change to files holds each file's whole text
 * before and after: source files are small, and the texts make undo exact without a diff to go stale.
 * A change a plugin made itself (`Done`) holds the plugin's name and its record, and undoing it is the
 * plugin's `undo`.
 *
 * Each change has a scope, the plugin and the element it was made on, and the popup undoes and redoes
 * within its own: the latest change of this tab on this element, not the latest of all. So a change
 * is taken back out of order, with later ones to the same file still in it. Then only the lines the
 * change wrote go back to what they were, where they're still in the file as it wrote them, once.
 *
 * Anything else is refused, not merged: a file whose lines were edited since has the editor's own undo
 * for it; and a redo likewise. A plugin's undo refuses on its own terms. Kept under `.deictic`, so it
 * outlives a restart of the dev server and stays out of git.
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

/** Whose a change is: the plugin whose tab made it, and the element it was open on, as `file:line:column`. */
export interface Scope {
  plugin: string;
  target: string;
}

interface Base {
  id: number;
  at: string;
  label: string;
  /** None on a change made without one, which only an undo of the whole history reaches. */
  scope?: Scope;
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

/** Whether a change is in a scope: any is in none. */
const within = (scope: Scope | undefined) => (c: Change) =>
  scope === undefined || (c.scope?.plugin === scope.plugin && c.scope.target === scope.target);

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

  /** Writes each file's new text and records it as one change. A redo after it, in its scope, is gone, as in any editor. */
  commit(label: string, texts: Map<string, string>, scope?: Scope): Summary {
    const files: FileChange[] = [];
    for (const [file, after] of texts) {
      const path = resolveFile(this.#root, file);
      const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
      if (before !== after) files.push({ file, before, after });
    }
    if (files.length === 0) throw new Refusal('nothing to change: the source already says that');
    for (const f of files) write(resolveFile(this.#root, f.file), f.after);
    return this.#push({ label, files }, scope);
  }

  /** Records a change `plugin` made itself, with what its `undo` needs. */
  record(label: string, plugin: string, record: unknown, scope?: Scope): Summary {
    return this.#push({ label, plugin, record }, scope);
  }

  /** Takes back the latest change, of a scope where one is given. */
  async undo(scope?: Scope): Promise<Summary> {
    const change = this.#done.findLast(within(scope));
    if (change === undefined) throw new Refusal(scope === undefined ? 'nothing to undo' : 'nothing to undo here');
    if ('files' in change) this.#put(change, 'after', 'before');
    else change.record = (await this.#pluginOf(change, 'undo').undo!(change.record)) ?? change.record;
    this.#done = this.#done.filter((c) => c !== change);
    this.#undone.push(change);
    this.#save();
    return summary(change);
  }

  /** Makes the change last undone again, of a scope where one is given. */
  async redo(scope?: Scope): Promise<Summary> {
    const change = this.#undone.findLast(within(scope));
    if (change === undefined) throw new Refusal(scope === undefined ? 'nothing to redo' : 'nothing to redo here');
    if ('files' in change) this.#put(change, 'before', 'after');
    else change.record = await this.#pluginOf(change, 'redo').redo!(change.record);
    this.#undone = this.#undone.filter((c) => c !== change);
    this.#done.push(change);
    this.#save();
    return summary(change);
  }

  list(scope?: Scope): { done: Summary[]; undone: Summary[] } {
    return { done: this.#done.filter(within(scope)).map(summary), undone: this.#undone.filter(within(scope)).map(summary) };
  }

  #push(change: Omit<Base, 'id' | 'at'> & ({ files: FileChange[] } | { plugin: string; record: unknown }), scope?: Scope): Summary {
    const id = Math.max(0, ...[...this.#done, ...this.#undone].map((c) => c.id)) + 1;
    const made = { id, at: new Date().toISOString(), ...change, ...(scope === undefined ? {} : { scope }) };
    this.#done = [...this.#done, made].slice(-LIMIT);
    // What was undone in this scope can't be redone over the new change; another scope's still can.
    this.#undone = this.#undone.filter((c) => !within(scope)(c));
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

  /**
   * Puts each file's `to` text back, once every one of them still reads as its `from`, or still has the
   * lines that differ as `from` has them: then those lines alone change, and the rest stays as it is now.
   */
  #put(change: Base & { files: FileChange[] }, from: 'before' | 'after', to: 'before' | 'after'): void {
    const paths = change.files.map((f) => resolveFile(this.#root, f.file));
    const texts = change.files.map((f, i) => {
      const now = existsSync(paths[i]!) ? readFileSync(paths[i]!, 'utf8') : null;
      if (now === f[from]) return f[to];
      const text = now === null || f[from] === null || f[to] === null ? undefined : swapped(now, f[from], f[to]);
      if (text === undefined) {
        throw new Refusal(
          `${f.file} changed since "${change.label}" ${from === 'after' ? 'was made' : 'was undone'}: use the editor's undo there`,
        );
      }
      return text;
    });
    texts.forEach((text, i) => {
      if (text === null) rmSync(paths[i]!);
      else write(paths[i]!, text);
    });
  }

  #save(): void {
    write(this.#store, JSON.stringify({ done: this.#done, undone: this.#undone }));
  }
}

/**
 * `now` with the lines that differ between `from` and `to` put as `to` has them, where `now` has them as
 * `from` does, in one place only. Nothing where it doesn't (they were edited, or there are two of them), or
 * where `from` has no such lines to find (the change only removed some).
 */
function swapped(now: string, from: string, to: string): string | undefined {
  const [a, b, lines] = [from.split('\n'), to.split('\n'), now.split('\n')];
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a.at(-1 - tail) === b.at(-1 - tail)) tail++;
  const theirs = a.slice(head, a.length - tail);
  if (theirs.length === 0) return undefined;
  const found = lines.flatMap((_, i) => (theirs.every((line, j) => lines[i + j] === line) ? [i] : []));
  if (found.length !== 1) return undefined;
  return [...lines.slice(0, found[0]), ...b.slice(head, b.length - tail), ...lines.slice(found[0]! + theirs.length)].join('\n');
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
