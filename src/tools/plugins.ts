/**
 * The plugins an integration was given: checked as it starts, so a wrong set fails the dev server with
 * what to write instead, and set up once before the endpoints answer anything.
 */
import type { ServerContext, ServerPlugin } from '#src/index.ts';
import { checkShortcuts, OWN, ownShortcut, type Shortcut } from '#src/shortcut.ts';

import { messageOf, type Report, stackOf } from './problems.ts';

const NAME = /^[a-z][a-z0-9-]*$/;

/** Throws what to fix in a set of plugins: names, what they need, and their shortcuts, beside deictic's own. */
export function checkPlugins(plugins: readonly ServerPlugin[], own?: Shortcut | false): void {
  const names = new Set<string>();
  for (const { name, client, shortcut } of plugins) {
    if (!NAME.test(name)) throw new Error(`deictic: a plugin is named "${name}": name it in lowercase letters, digits and -`);
    if (names.has(name)) throw new Error(`deictic: two plugins are named ${name}: load each once`);
    if (shortcut !== undefined && client === undefined)
      throw new Error(`deictic: ${name} has a shortcut but no \`client\` to draw its panel: give it one, or leave out its shortcut`);
    names.add(name);
  }
  for (const { name, needs = [] } of plugins) {
    const missing = needs.find((other) => !names.has(other));
    if (missing !== undefined) throw new Error(`deictic: ${name} needs the ${missing} plugin: add it to \`plugins\``);
  }
  checkShortcuts([{ name: OWN, shortcut: ownShortcut(own) }, ...plugins]);
}

/**
 * Runs every plugin's `setup`, all at once, and answers the context they share: `use` reads an API
 * when it's asked for, so setups may `use` each other's only after they've all run, from a route or an
 * op, never in `setup` itself. One that fails is reported and has no API: the others go on, so one of them
 * can tell of it (tasks, on the board).
 */
export async function setUp(root: string, plugins: readonly ServerPlugin[], report: Report): Promise<ServerContext> {
  const apis = new Map<string, unknown>();
  const context: ServerContext = { root, use: (name) => apis.get(name) as never, report };
  await Promise.all(
    plugins.map(async (p) => {
      if (p.setup === undefined) return;
      try {
        apis.set(p.name, await p.setup(context));
      } catch (e) {
        report({
          key: `setup:${p.name}`,
          kind: 'bug',
          plugin: p.name,
          message: `${p.name} failed to set up, so it does nothing until the dev server restarts: ${messageOf(e)}`,
          ...stackOf(e),
        });
      }
    }),
  );
  return context;
}
