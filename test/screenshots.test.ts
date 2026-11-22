import { afterAll, expect, test } from 'bun:test';

import { board } from '@vercel/board';
import { local } from '@vercel/board/backend-local';

import { dom, screenshots } from '#src/plugins/screenshots/index.ts';
import { type Model, tasks } from '#src/plugins/tasks/index.ts';
import { endpoints, redirect } from '#src/tools/endpoints.ts';
import { clientModule } from '#src/vite.ts';

import { project } from './fixture.ts';

const ORIGIN = 'http://localhost:5173';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const backend = local({ memory: true });
const team = board({ backend });
afterAll(() => backend.close());

function setup(options: Parameters<typeof screenshots>[0] = {}) {
  const p = project({ 'src/App.tsx': 'export const App = () => <h1>Pricing</h1>;\n' });
  const handle = endpoints({
    root: p.root,
    plugins: [screenshots(options), tasks({ board: team, channel: 'shots' })],
    open: () => redirect('/'),
  });
  const ask = (path: string, init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}) =>
    handle(new Request(`${ORIGIN}/__deictic/${path}`, { ...init, headers: { origin: ORIGIN, ...init.headers } })).then((r) => r!);
  const add = async (body: BodyInit = PNG, type = 'image/png') => {
    const res = await ask('plugins/screenshots/add', { method: 'POST', headers: { 'content-type': type }, body });
    return { status: res.status, ...((await res.json()) as { id?: string; problem?: string }) };
  };
  return { p, ask, add };
}

test('keeps a PNG the page sends, and serves it back', async () => {
  const { ask, add } = setup();
  const { id } = await add();
  expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  const shot = await ask(`plugins/screenshots/shot/${id}`);
  expect(shot.headers.get('content-type')).toBe('image/png');
  expect(new Uint8Array(await shot.arrayBuffer())).toEqual(PNG);
  expect((await ask('plugins/screenshots/shot/nope')).status).toBe(404);
  expect((await ask('plugins/screenshots/shot/..%2f..%2fpackage')).status).toBe(404);
});

test('takes only PNGs, and keeps the latest few', async () => {
  const { add, ask } = setup({ keep: 2 });
  expect(await add('<svg/>', 'image/svg+xml')).toMatchObject({ status: 415, problem: 'send the shot as image/png' });
  const [first, second, third] = [await add(), await add(), await add()];
  expect((await ask(`plugins/screenshots/shot/${first.id}`)).status).toBe(404);
  expect((await ask(`plugins/screenshots/shot/${second.id}`)).status).toBe(200);
  expect((await ask(`plugins/screenshots/shot/${third.id}`)).status).toBe(200);
});

test('a task attaches the shot it names, and leaves out one no longer kept', async () => {
  const { p, ask, add } = setup();
  const { id } = await add();
  const post = (body: unknown) =>
    ask('apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(
      async (r) => (await r.json()) as { model: Model; problem?: string },
    );
  const op = { text: 'Too tight', page: `${ORIGIN}/`, viewport: { width: 800, height: 600 }, count: 1 };
  const target = p.target('src/App.tsx', 'h1');

  const { model } = await post({
    plugin: 'tasks',
    target,
    op: {
      ...op,
      screenshots: [{ id, box: { x: 10.4, y: 20, width: 300, height: 24 } }],
      annotations: { count: 2, notes: ['Make it red'] },
    },
  });
  const { message } = await team.thread(model.tasks[0]!.id);
  // One shot's place is a label; the text has a line for it only when marks are drawn on it.
  expect(message.labels).toMatchObject({ 'deictic.position': '10,20', 'deictic.size': '300x24' });
  expect(message.text).not.toContain('The screenshot has');
  expect(message.text).toContain('2 marks on the page, drawn in the screenshot; the notes say: "Make it red"');
  expect(message.attachments).toEqual([expect.objectContaining({ name: `${id}.png`, type: 'image/png', size: PNG.length })]);

  const box = { x: 0, y: 0, width: 1, height: 1 };
  // The outline is in the picture, not the words.
  const outlined = await post({ plugin: 'tasks', target, op: { ...op, screenshots: [{ id, box, outlined: true }] } });
  expect((await team.thread(outlined.model.tasks.at(-1)!.id)).message.text).toBe('Too tight');
  // With no words, the task is named by what's attached; with nothing attached either, it's refused.
  const wordless = await post({ plugin: 'tasks', target, op: { ...op, text: ' ', screenshots: [{ id, box }] } });
  expect(wordless.model.tasks.map((t) => t.title)).toContain('See the screenshot');
  expect((await post({ plugin: 'tasks', target, op: { ...op, text: ' ' } })).problem).toBe('say what should change first');
  // One no longer kept is left out, and the task says so, as the panel does.
  const shots = [
    { id, box },
    { id: 'gone-123', box },
  ];
  const partly = await post({ plugin: 'tasks', target, op: { ...op, screenshots: shots } });
  const sent = partly.model.tasks.at(-1)!;
  expect(sent.dropped).toBe('a screenshot');
  const kept = (await team.thread(sent.id)).message;
  expect(kept.text).toContain("Not attached, as it wasn't kept any more: a screenshot");
  expect(kept.attachments.filter((a) => a.type === 'image/png')).toHaveLength(1);
  // With nothing else to say what should change, it's refused.
  const none = [
    { id: 'gone-1', box },
    { id: 'gone-2', box },
  ];
  expect((await post({ plugin: 'tasks', target, op: { ...op, text: ' ', screenshots: none } })).problem).toBe(
    "2 screenshots aren't kept any more: attach again, or say what should change",
  );
});

test('loads its renderer in the page, rrweb() by default, with the masking by rrweb’s names and defaults', () => {
  const code = clientModule([screenshots({ maskAllInputs: true, blockSelector: '[data-private]' })], '/');
  expect(code).toContain('import p0 from "deictic/screenshots/rrweb";');
  expect(code).toContain(
    `{ plugin: p0, ...{"options":{"masking":{"blockClass":"rr-block","blockSelector":"[data-private]","maskTextClass":"rr-mask","maskAllInputs":true}}} }`,
  );
  expect(clientModule([screenshots({ renderer: dom() })], '/')).toContain('import p0 from "deictic/screenshots/dom";');
});

test("hands what a renderer's page half sends to its render, and keeps the PNG it makes", async () => {
  const seen: unknown[] = [];
  const renderer = {
    client: 'my/renderer',
    clientOptions: { quality: 'high' },
    render: async (input: unknown) => (seen.push(input), PNG),
  };
  const { ask, add } = setup({ renderer });
  const { id } = await add(JSON.stringify({ snapshot: 1 }), 'application/json');
  expect(seen).toEqual([{ snapshot: 1 }]);
  expect(new Uint8Array(await (await ask(`plugins/screenshots/shot/${id}`)).arrayBuffer())).toEqual(PNG);
  // What it can't render, the page hears.
  renderer.render = async () => {
    throw new Error('no browser here');
  };
  expect(await add('{}', 'application/json')).toMatchObject({ status: 500, problem: 'no browser here' });
});

test('takes a PNG and nothing else from a renderer without render', async () => {
  const { add } = setup({ renderer: dom() });
  expect(await add('{}', 'application/json')).toMatchObject({ status: 415, problem: 'send the shot as image/png' });
});

test('a task attaches each shot drawn on, saying what was drawn on which', async () => {
  const { p, ask, add } = setup();
  const [one, two] = [await add(), await add()];
  const res = await ask('apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      plugin: 'tasks',
      target: p.target('src/App.tsx', 'h1'),
      op: {
        text: 'Too tight',
        page: `${ORIGIN}/`,
        viewport: { width: 800, height: 600 },

        count: 1,
        screenshots: [
          { id: one.id, box: { x: 10, y: 20, width: 300, height: 24 }, marks: { count: 2, notes: ['Too close'] } },
          { id: two.id, box: { x: 0, y: 0, width: 300, height: 24 }, outlined: true },
        ],
      },
    }),
  });
  const { model } = (await res.json()) as { model: Model };
  const { message } = await team.thread(model.tasks.at(-1)!.id);
  expect(message.text).toContain('In screenshot 1 at x 10, y 20, 300×24, with 2 marks drawn on it; the notes say: "Too close"');
  expect(message.text).toEndWith('\nIn screenshot 2 at x 0, y 0, 300×24');
  expect(message.labels['deictic.position']).toBeUndefined();
  expect(message.labels['deictic.size']).toBeUndefined();
  expect(message.attachments?.map((a) => a.name)).toEqual([`${one.id}.png`, `${two.id}.png`]);
});
