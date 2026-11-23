/**
 * deictic's problems on the server, and those the page sends (`/__deictic/problem`): each said once in the dev server's
 * output, and handed to every plugin with a `problem` once they're all set up, which the tasks plugin posts to the
 * board. Once per key while the dev server runs: a request that fails on every try is still one problem.
 */
import type { Problem, ServerPlugin } from '#src/index.ts';

/** How much of a problem is kept: its words, and its details (a stack is shorter). */
const WORDS = 2000;
const DETAILS = 20_000;

export type Report = (problem: Problem) => void;

/** What reports a problem: `ready` is when the plugins that hear of them are set up to. */
export function reporter(plugins: readonly ServerPlugin[], ready: () => Promise<unknown>): Report {
  const said = new Set<string>();
  return (problem) => {
    if (said.has(problem.key)) return;
    said.add(problem.key);
    console.warn(`deictic${problem.plugin === undefined ? '' : `/${problem.plugin}`}: ${problem.message}`);
    const hearing = plugins.filter((p) => p.problem !== undefined);
    if (hearing.length === 0) return;
    // Its own failure is said, not reported: a board that can't be reached would report itself for ever.
    const tell = async (plugin: ServerPlugin) => {
      try {
        await plugin.problem?.(problem);
      } catch (e) {
        console.warn(`deictic: ${plugin.name} couldn't take that problem, as ${messageOf(e)}`);
      }
    };
    // Later, never now: a setup that fails at once reports before what it's part of is ready to be waited for.
    void Promise.resolve()
      .then(ready)
      .then(
        () => Promise.all(hearing.map(tell)),
        () => {},
      );
  };
}

/** What went wrong, as a problem's words say it: an error's message. */
export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** An error's stack, where it has one, for a problem's details. */
export const stackOf = (e: unknown) => (e instanceof Error && e.stack !== undefined ? { details: e.stack } : {});

/** A problem as the page sent it, checked and cut short, or nothing where it isn't one. */
export function problemIn(value: unknown): Problem | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { key, kind, message, details, plugin } = value as Record<string, unknown>;
  if (typeof key !== 'string' || key === '' || typeof message !== 'string' || message === '') return undefined;
  if (kind !== 'setup' && kind !== 'bug') return undefined;
  return {
    key: key.slice(0, WORDS),
    kind,
    message: message.slice(0, WORDS),
    ...(typeof details === 'string' && details !== '' ? { details: details.slice(0, DETAILS) } : {}),
    ...(typeof plugin === 'string' && plugin !== '' ? { plugin: plugin.slice(0, 100) } : {}),
  };
}
