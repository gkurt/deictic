import { afterAll, expect, test } from 'bun:test';

import { board } from '@vercel/board';
import { local } from '@vercel/board/backend-local';

import { type Model, tasks, type TasksOptions } from '#src/plugins/tasks/index.ts';
import { endpoints, redirect } from '#src/tools/endpoints.ts';

import { project } from './fixture.ts';

const ORIGIN = 'http://localhost:5173';
const backend = local({ memory: true });
const team = board({ backend });
afterAll(() => backend.close());

const op = {
  text: 'The headline wraps on phones\nKeep it on one line down to 360px.',
  page: `${ORIGIN}/pricing?plan=pro`,
  viewport: { width: 390, height: 844 },
  count: 1,
};

function setup(channel: string, options: TasksOptions = {}, files: Record<string, string> = {}) {
  const p = project({ 'src/App.tsx': 'export const App = () => <h1 className="text-4xl">Pricing</h1>;\n', ...files });
  const handle = endpoints({
    root: p.root,
    plugins: [tasks({ board: team, channel, labels: { team: 'web' }, ...options })],
    open: () => redirect('/'),
  });
  const post = async <T>(route: string, body: unknown = {}) => {
    const res = (await handle(
      new Request(`${ORIGIN}/__deictic/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify(body),
      }),
    ))!;
    return { status: res.status, json: (await res.json()) as T & { problem?: string } };
  };
  return { p, post, target: p.target('src/App.tsx', 'h1') };
}

test('adds a task saying what and where, and lists it on the element', async () => {
  const { p, post, target } = setup('add');
  expect((await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model).toEqual({ channel: 'add', tasks: [] });

  const { json } = await post<{ model: Model; change: { label: string; files: string[] } }>('apply', { plugin: 'tasks', target, op });
  expect(json.change).toMatchObject({ label: 'tasks src/App.tsx:1: task "The headline wraps on phones"', files: [] });
  expect(json.model.tasks).toEqual([{ id: expect.any(String), title: 'The headline wraps on phones', state: 'ready' }]);

  const { message } = await team.thread(json.model.tasks[0]!.id);
  expect(message.labels).toEqual({
    team: 'web',
    'deictic.at': 'src/App.tsx:1:26',
    'deictic.tag': 'h1',
    'deictic.line': '<h1 className="text-4xl">',
    'deictic.page': '/pricing',
    'deictic.url': op.page,
    'deictic.viewport': '390x844',
    'deictic.count': '1',
    'board.task': 'ready',
  });
  // Only what was typed: where it is and the page are labels, and no package.json names a project.
  expect(message.text).toBe(op.text);
  // A task touches no file.
  expect(p.read('src/App.tsx')).toContain('className="text-4xl"');
});

test("names the project: the package.json's name, or the option's", async () => {
  const files = { 'package.json': '{ "name": "@shop/storefront" }' };
  const labelsOf = async (channel: string, options?: TasksOptions) => {
    const { post, target } = setup(channel, options, files);
    const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op });
    return (await team.thread(json.model.tasks[0]!.id)).message.labels;
  };
  expect((await labelsOf('named'))['deictic.project']).toBe('@shop/storefront');
  expect((await labelsOf('renamed', { project: 'shop' }))['deictic.project']).toBe('shop');
});

test("a URL too long for a label stays in the task's text", async () => {
  const { post, target } = setup('long');
  const page = `${ORIGIN}/pricing?q=${'x'.repeat(300)}`;
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op: { ...op, page } });
  const { message } = await team.thread(json.model.tasks[0]!.id);
  expect(message.labels['deictic.url']).toBeUndefined();
  expect(message.text).toBe(`${op.text}\n---\n${page}`);
});

test('says what was pointed at inside the element, where nothing marked it', async () => {
  const { post, target } = setup('pointed');
  const pointed = {
    path: '#shadow-root > div.panel.pinned > div.head > button.tab:nth-of-type(2)',
    html: '<button class="tab">Tailwind</button>',
  };
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op: { ...op, pointed } });
  const { message } = await team.thread(json.model.tasks[0]!.id);
  expect(message.text).toContain(`Pointed at, inside it: \`${pointed.path}\``);
  expect(message.text).toContain(pointed.html);
});

test('undo cancels the task and redo adds it again, as a new one', async () => {
  const { post, target } = setup('undo');
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op });
  const first = json.model.tasks[0]!.id;

  expect((await post<{ change: { label: string } }>('undo')).json.change.label).toContain('task "The headline');
  expect((await team.thread(first)).message.task?.state).toBe('canceled');
  expect((await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model.tasks).toEqual([]);

  await post('redo');
  const again = (await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model.tasks;
  expect(again).toHaveLength(1);
  expect(again[0]!.id).not.toBe(first);

  // The redone task is what the next undo takes back.
  await post('undo');
  expect((await team.thread(again[0]!.id)).message.task?.state).toBe('canceled');
});

test('refuses to undo a task someone has claimed', async () => {
  const { post, target } = setup('claimed');
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op });
  await team.tasks.claim(json.model.tasks[0]!.id);

  const undo = await post('undo');
  expect(undo.status).toBe(422);
  expect(undo.json.problem).toMatch(/^task \d+ is claimed by .+ now: cancel it on the board if you still mean to$/);
});

test('refuses an empty task, and says how to reach a board when there is none', async () => {
  const { post, target } = setup('empty');
  expect((await post('apply', { plugin: 'tasks', target, op: { ...op, text: '  ' } })).json.problem).toBe('say what should change first');

  const p = project({ 'src/App.tsx': 'export const App = () => <h1>x</h1>;\n' });
  const unreachable = { tasks: { list: () => Promise.reject(new TypeError('fetch failed')) } } as never;
  const handle = endpoints({ root: p.root, plugins: [tasks({ board: unreachable })], open: () => redirect('/') });
  const res = (await handle(
    new Request(`${ORIGIN}/__deictic/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ plugin: 'tasks', target: p.target('src/App.tsx', 'h1') }),
    }),
  ))!;
  expect(res.status).toBe(422);
  expect(((await res.json()) as { problem: string }).problem).toContain('run `npx vb serve` and set BOARD_URL');
});

test("links the channel to a local board's page, to the page `link` names, or nowhere", async () => {
  const at = (url: string) => ({
    tasks: team.tasks,
    thread: team.thread,
    upload: (input: Parameters<typeof team.upload>[0]) => team.upload(input),
    discovery: async () => ({ ...(await team.discovery()), url }),
  });
  const linkFor = async (options: Parameters<typeof tasks>[0]) => {
    const p = project({ 'src/App.tsx': 'export const App = () => <h1>x</h1>;\n' });
    const handle = endpoints({ root: p.root, plugins: [tasks({ channel: 'ui/home', ...options })], open: () => redirect('/') });
    const res = (await handle(
      new Request(`${ORIGIN}/__deictic/read`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ plugin: 'tasks', target: p.target('src/App.tsx', 'h1') }),
      }),
    ))!;
    return ((await res.json()) as { model: Model }).model.link;
  };
  expect(await linkFor({ board: at('http://127.0.0.1:4100/api/board') })).toBe('http://127.0.0.1:4100/c/ui/home');
  expect(await linkFor({ board: at('https://board.example.com/api/board') })).toBeUndefined();
  expect(await linkFor({ board: at('http://127.0.0.1:4100/api/board'), link: (c) => `https://boards.test/${c}` })).toBe(
    'https://boards.test/ui/home',
  );
});
