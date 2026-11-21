import { afterAll, expect, test } from 'bun:test';

import { board } from '@vercel/board';
import { local } from '@vercel/board/backend-local';

import { type Kept, recordings, replayPage } from '#src/plugins/recordings/index.ts';
import { dropOurs } from '#src/plugins/recordings/ours.ts';
import { type Model, tasks } from '#src/plugins/tasks/index.ts';
import { endpoints, redirect } from '#src/tools/endpoints.ts';
import { clientModule } from '#src/vite.ts';

import { project } from './fixture.ts';

const ORIGIN = 'http://localhost:5173';
const backend = local({ memory: true });
const team = board({ backend });
afterAll(() => backend.close());

const KEPT: Kept = {
  page: `${ORIGIN}/pricing`,
  viewport: { width: 800, height: 600 },
  startedAt: 0,
  duration: 12_400,
  events: [{ type: 4, data: { href: `${ORIGIN}/pricing`, width: 800, height: 600 }, timestamp: 0 }],
};

function setup(options: Parameters<typeof recordings>[0] = {}) {
  const p = project({ 'src/App.tsx': 'export const App = () => <h1>Pricing</h1>;\n' });
  const handle = endpoints({
    root: p.root,
    plugins: [recordings(options), tasks({ board: team, channel: 'recordings' })],
    open: () => redirect('/'),
  });
  const ask = (path: string, init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}) =>
    handle(new Request(`${ORIGIN}/__deictic/${path}`, { ...init, headers: { origin: ORIGIN, ...init.headers } })).then((r) => r!);
  const add = async (body: BodyInit = JSON.stringify(KEPT), type = 'application/json') => {
    const res = await ask('plugins/recordings/add', { method: 'POST', headers: { 'content-type': type }, body });
    return { status: res.status, ...((await res.json()) as { id?: string; problem?: string }) };
  };
  return { p, ask, add };
}

test('keeps what the page recorded, serves it back, and a page to replay it with rrweb’s player', async () => {
  const { ask, add } = setup();
  const { id } = await add();
  expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  expect(await (await ask(`plugins/recordings/recording/${id}`)).json()).toEqual(KEPT);
  expect((await ask('plugins/recordings/recording/nope')).status).toBe(404);

  const replay = await ask(`plugins/recordings/replay/${id}`);
  expect(replay.headers.get('content-type')).toStartWith('text/html');
  const html = await replay.text();
  expect(html).toContain('<script src="../player.js"></script>');
  expect(html).toContain('"deictic.annotations"');
  // Published as a file, with no routes: the player from where it's put, and a script of the page's to say where a recording is.
  const published = replayPage({ player: './replay', source: './replay/source.js' });
  expect(published).toContain('<script src="./replay/player.js"></script>\n<script src="./replay/source.js"></script>');
  expect(published).toContain('href="./replay/player.css"');
  const player = await ask('plugins/recordings/player.js');
  expect(player.headers.get('content-type')).toBe('text/javascript');
  expect(await player.text()).toContain('"rrweb"');
  expect((await ask('plugins/recordings/player.css')).status).toBe(200);
});

test('takes only a recording with events, as JSON, and keeps the latest few', async () => {
  const { ask, add } = setup({ keep: 2 });
  expect(await add('events', 'text/plain')).toMatchObject({ status: 415, problem: 'send the recording as application/json' });
  expect(await add('{', 'application/json')).toMatchObject({ status: 400, problem: "the recording isn't JSON" });
  expect(await add(JSON.stringify({ ...KEPT, events: [] }))).toMatchObject({ status: 400 });
  const [first, second, third] = [await add(), await add(), await add()];
  expect((await ask(`plugins/recordings/recording/${first.id}`)).status).toBe(404);
  expect((await ask(`plugins/recordings/recording/${second.id}`)).status).toBe(200);
  expect((await ask(`plugins/recordings/recording/${third.id}`)).status).toBe(200);
});

test('a task attaches the recording, saying how long it ran and where it replays', async () => {
  const { p, ask, add } = setup();
  const { id } = await add();
  const post = (op: object) =>
    ask('apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        plugin: 'tasks',
        target: p.target('src/App.tsx', 'h1'),
        op: { text: 'Flickers', page: `${ORIGIN}/`, viewport: { width: 800, height: 600 }, count: 1, ...op },
      }),
    }).then(async (r) => (await r.json()) as { model: Model; problem?: string });
  const replay = `${ORIGIN}/__deictic/plugins/recordings/replay/${id}`;

  const { model } = await post({ recordings: [{ id, duration: 12_400, replay }], annotations: { count: 1, notes: [] } });
  const { message } = await team.thread(model.tasks.at(-1)!.id);
  expect(message.text).toContain('1 mark on the page, drawn in the recording');
  expect(message.text).toContain(`A recording, 0:12 long, attached as rrweb events; it replays at ${replay}`);
  expect(message.attachments).toEqual([expect.objectContaining({ name: `recording-${id}.json`, type: 'application/json' })]);

  expect((await post({ recordings: [{ id: 'gone-123', duration: 1, replay }] })).problem).toBe(
    "recording gone-123 isn't kept any more: record it again",
  );
});

test('masks as rrweb does, by its names and defaults, in the page', () => {
  expect(clientModule([recordings({ maskAllInputs: true })], '/')).toContain(
    `{ plugin: p0, ...{"options":{"masking":{"blockClass":"rr-block","maskTextClass":"rr-mask","maskAllInputs":true}}} }`,
  );
});

test('leaves deictic’s own UI out: what rrweb sees added under the overlay, and events on it', () => {
  const keep = dropOurs(
    () => 7,
    () => 1,
  );
  const mutation = (data: object) => ({ type: 3, data: { source: 0, adds: [], removes: [], texts: [], attributes: [], ...data } });
  // The toolbar's bar under the host (7), its button under the bar: in either order. The page's own add stays.
  const added = keep(
    mutation({
      adds: [
        { parentId: 8, node: { id: 9 } },
        { parentId: 7, node: { id: 8 } },
        { parentId: 1, node: { id: 20 } },
      ],
    }),
  );
  expect(added).toEqual(mutation({ adds: [{ parentId: 1, node: { id: 20 } }] }));
  expect(keep(mutation({ texts: [{ id: 9 }], attributes: [{ id: 8 }] }))).toBeUndefined();
  expect(keep(mutation({ removes: [{ parentId: 8, id: 9 }] }))).toBeUndefined();
  // A click on the toolbar goes; the pointer's moves over it stay, over the page's root, so the replay's cursor moves.
  expect(keep({ type: 3, data: { source: 2, id: 9, type: 2 } })).toBeUndefined();
  expect(
    keep({
      type: 3,
      data: {
        source: 1,
        positions: [
          { id: 9, x: 5 },
          { id: 20, x: 6 },
        ],
      },
    }),
  ).toEqual({
    type: 3,
    data: {
      source: 1,
      positions: [
        { id: 1, x: 5 },
        { id: 20, x: 6 },
      ],
    },
  });
  expect(keep({ type: 2, data: { node: {} } })).toEqual({ type: 2, data: { node: {} } });
});
