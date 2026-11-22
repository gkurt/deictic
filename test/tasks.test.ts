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
  expect((await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model).toEqual({
    channel: 'add',
    tasks: [],
    elsewhere: [],
  });

  const { json } = await post<{ model: Model; change: { label: string; files: string[] } }>('apply', { plugin: 'tasks', target, op });
  expect(json.change).toMatchObject({ label: 'tasks src/App.tsx:1: task "The headline wraps on phones"', files: [] });
  expect(json.model.tasks).toEqual([
    { id: expect.any(String), title: 'The headline wraps on phones', text: op.text, state: 'ready', open: true },
  ]);

  const { message } = await team.thread(json.model.tasks[0]!.id);
  expect(message.labels).toEqual({
    team: 'web',
    'deictic.at': 'src/App.tsx:1:26',
    'deictic.file': 'src/App.tsx',
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

test("lists the file's other tasks apart, and keeps an element's own as it moves", async () => {
  const page = (above: string) =>
    `${above}export const App = () => (\n  <main>\n    <h1 className="text-4xl">Pricing</h1>\n    <li>One</li>\n    <li>One</li>\n  </main>\n);\n`;
  const { p, post } = setup(
    'file',
    {},
    { 'src/App.tsx': page(''), 'src/Other.tsx': 'export const Other = () => <h1 className="text-4xl">Other</h1>;\n' },
  );
  const read = async (tag: string, file = 'src/App.tsx') =>
    (await post<{ model: Model }>('read', { plugin: 'tasks', target: p.target(file, tag) })).json.model;
  const add = (tag: string, text: string) => post('apply', { plugin: 'tasks', target: p.target('src/App.tsx', tag), op: { ...op, text } });
  await add('h1', 'The headline');
  await add('li', 'The first row');
  // One added before tasks said their file is still its element's, by its place.
  await team.tasks.create('file', { text: 'An old one', labels: { 'deictic.at': 'src/App.tsx:3:5', 'deictic.tag': 'h1' } });

  const before = await read('h1');
  expect(before.tasks.map((t) => [t.title, t.at])).toEqual([
    ['An old one', undefined],
    ['The headline', undefined],
  ]);
  expect(before.elsewhere).toEqual([expect.objectContaining({ title: 'The first row', at: { line: 4, column: 5, tag: 'li' } })]);
  expect((await read('h1', 'src/Other.tsx')).elsewhere).toEqual([]);

  // Lines above change, and the page is loaded again: the headline's task is still its own, by its tag and line.
  p.write('src/App.tsx', page('// Prices\n\n'));
  const after = await read('h1');
  expect(after.tasks).toEqual([expect.objectContaining({ title: 'The headline', open: true, at: { line: 3, column: 5, tag: 'h1' } })]);
  // A row's line is there twice, so its task can't be told to be either's; the old one, with no file, is found at its place only.
  expect(after.elsewhere.map((t) => t.title)).toEqual(['The first row']);
  expect((await read('li')).tasks).toEqual([]);
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

test("edits a task's words, keeping what follows them, and undo puts them back", async () => {
  const { post, target } = setup('edit');
  const pointed = { path: 'span.icon', html: '<span class="icon"></span>' };
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op: { ...op, pointed } });
  const { id } = json.model.tasks[0]!;
  const before = (await team.thread(id)).message.text;

  const edited = await post<{ model: Model; change: { label: string } }>('apply', {
    plugin: 'tasks',
    target,
    op: { edit: id, text: 'Keep the headline on one line' },
  });
  expect(edited.json.change.label).toBe('tasks src/App.tsx:1: edit task "The headline wraps on phones"');
  expect(edited.json.model.tasks[0]).toMatchObject({ id, title: 'Keep the headline on one line', text: 'Keep the headline on one line' });
  expect((await team.thread(id)).message.text).toBe(`Keep the headline on one line${before.slice(op.text.length)}`);

  await post('undo');
  expect((await team.thread(id)).message.text).toBe(before);
  await post('redo');
  expect((await team.thread(id)).message.text).toStartWith('Keep the headline on one line\n---\n');

  // Edited on the board since: an undo would write over that, so it's refused.
  await team.edit(id, 'Changed on the board');
  expect((await post('undo')).json.problem).toBe(`task ${id} has been edited since: change it on the board`);
  expect((await post('apply', { plugin: 'tasks', target, op: { edit: id, text: ' ' } })).json.problem).toBe('say what should change first');
});

test('deletes a task by canceling it, and undo adds it again, as a new one', async () => {
  const { post, target } = setup('remove');
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op });
  const { id } = json.model.tasks[0]!;

  const removed = await post<{ model: Model; change: { label: string } }>('apply', { plugin: 'tasks', target, op: { remove: id } });
  expect(removed.json.change.label).toBe('tasks src/App.tsx:1: delete task "The headline wraps on phones"');
  expect(removed.json.model.tasks).toEqual([]);
  expect((await team.thread(id)).message.task?.state).toBe('canceled');

  // A board cancels for good, so what comes back is the same task under a new ID, which a redo cancels.
  await post('undo');
  const [again] = (await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model.tasks;
  expect(again).toMatchObject({ title: 'The headline wraps on phones', open: true });
  expect(again!.id).not.toBe(id);
  const { message } = await team.thread(again!.id);
  expect(message.labels).toMatchObject({ team: 'web', 'deictic.at': 'src/App.tsx:1:26', 'board.task': 'ready' });
  await post('redo');
  expect((await team.thread(again!.id)).message.task?.state).toBe('canceled');
});

test("changes only an open task of the channel's own", async () => {
  const { post, target } = setup('own');
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op });
  const { id } = json.model.tasks[0]!;
  const other = (await team.tasks.create('elsewhere', 'Not one of ours')).task.id;
  for (const change of [{ remove: other }, { edit: other, text: 'x' }]) {
    expect((await post('apply', { plugin: 'tasks', target, op: change })).json.problem).toBe(
      `#${other} isn't a task of deictic's in #own: reload the page for the ones that are`,
    );
  }

  await team.tasks.claim(id);
  expect((await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model.tasks[0]).toMatchObject({ open: false });
  expect((await post('apply', { plugin: 'tasks', target, op: { remove: id } })).json.problem).toMatch(
    / is claimed by .+ now: cancel it on the board/,
  );
  expect((await post('apply', { plugin: 'tasks', target, op: { edit: id, text: 'x' } })).json.problem).toMatch(
    / now: edit it on the board/,
  );
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
  expect(((await res.json()) as { problem: string }).problem).toContain('restart the dev server, which starts its own');
});

test("links the channel to a local board's page, to the page `link` names, or nowhere", async () => {
  const at = (url: string) => ({
    tasks: team.tasks,
    thread: team.thread,
    edit: team.edit,
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

  // Each task's ID links to its thread there, or to what `link` says of it.
  const linksOf = async (options: Parameters<typeof tasks>[0]) => {
    const p = project({ 'src/App.tsx': 'export const App = () => <h1>x</h1>;\n' });
    const handle = endpoints({ root: p.root, plugins: [tasks({ channel: 'ui/links', ...options })], open: () => redirect('/') });
    const res = (await handle(
      new Request(`${ORIGIN}/__deictic/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ plugin: 'tasks', target: p.target('src/App.tsx', 'h1'), op }),
      }),
    ))!;
    return ((await res.json()) as { model: Model }).model.tasks.at(-1)!;
  };
  const local = await linksOf({ board: at('http://127.0.0.1:4100/api/board') });
  expect(local.link).toBe(`http://127.0.0.1:4100/c/ui/links?thread=${local.id}`);
  expect((await linksOf({ board: at('https://board.example.com/api/board') })).link).toBeUndefined();
  const named = await linksOf({
    board: at('https://board.example.com/api/board'),
    link: (c, id) => `https://boards.test/${c}/${id ?? ''}`,
  });
  expect(named.link).toBe(`https://boards.test/ui/links/${named.id}`);
});
