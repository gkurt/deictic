import { expect, test } from 'bun:test';

import { definePlugin } from '#src/index.ts';
import { endpoints, redirect } from '#src/tools/endpoints.ts';
import { checkPlugins } from '#src/tools/plugins.ts';
import { clientModule } from '#src/vite.ts';

import { project } from './fixture.ts';

const ORIGIN = 'http://localhost:5173';

/** A plugin with no panel: an API for the others, and routes of its own. */
const shots = () =>
  definePlugin<never, never, never, { taken: () => string[] }>({
    name: 'shots',
    setup: () => {
      const taken: string[] = [];
      shots.taken = taken;
      return { taken: () => taken };
    },
    routes: {
      list: (_req, { use }) => Response.json(use('shots')),
      take: async (req) => {
        shots.taken.push(await req.text());
        return new Response(null, { status: 204 });
      },
    },
  });
shots.taken = [] as string[];

/** A plugin that uses another's API, which it `needs`. */
const counter = () =>
  definePlugin({
    name: 'counter',
    needs: ['shots'],
    routes: {
      count: (_req, { use }) => Response.json((use('shots') as { taken: () => string[] }).taken().length),
    },
  });

function setup() {
  const p = project({ 'src/App.tsx': 'export const App = () => <div>x</div>;\n' });
  const handle = endpoints({ root: p.root, plugins: [shots(), counter()], open: () => redirect('/') });
  const ask = (path: string, init: RequestInit = {}) => handle(new Request(`${ORIGIN}/__deictic/${path}`, init)).then((r) => r!);
  return { p, ask };
}

test("serves a plugin's routes, and lets it use another plugin's API", async () => {
  const { ask } = setup();
  const take = await ask('plugins/shots/take', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'image/png' }, body: 'png' });
  expect(take.status).toBe(204);
  expect(await (await ask('plugins/counter/count')).json()).toBe(1);
  expect(await (await ask('plugins/shots/list/anything/below')).json()).toEqual({});
});

test('takes writes to a route only from the page itself, and says when there is no route', async () => {
  const { ask } = setup();
  const from = (origin?: string) =>
    ask('plugins/shots/take', { method: 'POST', headers: origin === undefined ? {} : { origin }, body: 'x' }).then((r) => r.status);
  expect(await from('https://evil.example')).toBe(403);
  expect(await from()).toBe(403);
  expect((await ask('plugins/shots/nope')).status).toBe(404);
  expect((await ask('plugins/nobody/take')).status).toBe(404);
});

test('a plugin without a panel neither reads nor applies', async () => {
  const { p, ask } = setup();
  const post = (route: string, body: unknown) =>
    ask(route, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const target = p.target('src/App.tsx', 'div');
  expect(await (await post('read', { plugin: 'shots', target })).json()).toEqual({ model: null });
  expect(await (await post('apply', { plugin: 'shots', target, op: {} })).json()).toEqual({
    problem: 'shots changes nothing from its panel: it has no `apply`',
  });
});

test('stops the dev server for a set of plugins that would not work', () => {
  expect(() => checkPlugins([counter()])).toThrow('deictic: counter needs the shots plugin: add it to `plugins`');
  expect(() => checkPlugins([shots(), shots()])).toThrow('two plugins are named shots');
  expect(() => checkPlugins([definePlugin({ name: 'My Plugin' })])).toThrow('a plugin is named "My Plugin"');
  expect(() => checkPlugins([definePlugin({ name: 'lonely', shortcut: { modifiers: ['Alt'] } })])).toThrow(
    'lonely has a shortcut but no `client` to draw its panel',
  );
  expect(() => checkPlugins([])).not.toThrow();
});

test('starts the page with every half there, with a shortcut only for those with a panel', () => {
  const code = clientModule(
    [
      shots(),
      definePlugin({ name: 'rec', client: 'rec/client' }),
      definePlugin({ name: 'pin', client: 'pin/client', shortcut: { modifiers: ['Meta'] } }),
    ],
    '/',
  );
  expect(code).toContain(`import p0 from "rec/client";`);
  expect(code).toContain(
    `start({ base: "/", shortcut: {"modifiers":["Alt"],"button":"left"}, plugins: [{ plugin: p0, ...{} }, { plugin: p1, ...{"shortcut":{"modifiers":["Meta"],"button":"left"}} }] });`,
  );
});
