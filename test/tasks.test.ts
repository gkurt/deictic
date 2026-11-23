import { afterAll, expect, test } from 'bun:test';

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { board } from '@vercel/board';
import { local } from '@vercel/board/backend-local';

import { type Listed, type Model, tasks, type TasksOptions, type Thread } from '#src/plugins/tasks/index.ts';
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
  const get = async <T>(route: string) => (await (await handle(new Request(`${ORIGIN}/__deictic/${route}`)))!.json()) as T;
  return { p, post, get, target: p.target('src/App.tsx', 'h1') };
}

test('adds a task saying what and where, and lists it on the element', async () => {
  const { p, post, target } = setup('add');
  expect((await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model).toEqual({
    channel: 'add',
    tasks: [],
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

test('a task names the other elements it is about, and no element where none is attached', async () => {
  const { post, target } = setup('several');
  const also = [
    { at: 'src/Nav.tsx:4:7', tag: 'a', html: '<a>Docs</a>' },
    { at: 'src/Nav.tsx:9:5', tag: 'button' },
  ];
  const added = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op: { ...op, html: '<h1>Pricing</h1>', also } });
  const { message } = await team.thread(added.json.model.tasks[0]!.id);
  // The first is its place, as ever; the rest are numbered after it.
  expect(message.labels).toMatchObject({
    'deictic.at': 'src/App.tsx:1:26',
    'deictic.also.1': 'src/Nav.tsx:4:7 <a>',
    'deictic.also.2': 'src/Nav.tsx:9:5 <button>',
  });
  // The Nth element's HTML is `element.N.html`, where it was sent.
  expect(message.attachments?.map((a) => a.name)).toEqual(['element.html', 'element.2.html']);

  // With none attached it's the page's alone: nothing of the element it was sent on, whose tab doesn't list it.
  const page = await post<{ model: Model }>('apply', {
    plugin: 'tasks',
    target,
    op: { ...op, text: 'The page feels slow', count: 0, detached: true },
  });
  expect(page.json.model.tasks.map((t) => t.title)).toEqual(['The headline wraps on phones']);
  const { tasks: all } = await team.tasks.list({ channel: 'several', state: 'all' });
  expect(all.find((t) => t.message.text === 'The page feels slow')?.message.labels).toEqual({
    team: 'web',
    'deictic.page': '/pricing',
    'deictic.url': op.page,
    'deictic.viewport': '390x844',
    'board.task': 'ready',
  });
});

test("adds and lists tasks where the file has no such element, or doesn't parse: the task is the page's", async () => {
  const { p, post, target } = setup('stale');
  p.write('src/App.tsx', 'export const App = () => <p>Pricing</p>;\n');
  const { status, json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op });
  expect(status).toBe(200);
  const { message } = await team.thread(json.model.tasks[0]!.id);
  expect(message.labels).toMatchObject({ 'deictic.at': 'src/App.tsx:1:26', 'deictic.tag': 'h1' });
  expect(message.labels['deictic.line']).toBeUndefined();

  p.write('src/App.tsx', 'export const App = () => <h1>Pricing</h1;\n');
  expect((await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model.tasks).toHaveLength(1);
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

test('a URL too long for a label goes with its path only', async () => {
  const { post, target } = setup('long');
  const page = `${ORIGIN}/pricing?q=${'x'.repeat(300)}`;
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op: { ...op, page } });
  const { message } = await team.thread(json.model.tasks[0]!.id);
  expect(message.labels['deictic.url']).toBeUndefined();
  expect(message.labels['deictic.page']).toBe('/pricing');
  expect(message.text).toBe(op.text);
});

test('says what was pointed at inside the element, where nothing marked it', async () => {
  const { post, target } = setup('pointed');
  const pointed = {
    path: '#shadow-root > div.panel.pinned > div.head > button.tab:nth-of-type(2)',
    html: '<button class="tab">Tailwind</button>',
  };
  const html = '<h1 class="text-4xl">Pricing</h1>';
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op: { ...op, pointed, html } });
  const { message } = await team.thread(json.model.tasks[0]!.id);
  expect(message.labels['deictic.pointed']).toBe(pointed.path);
  expect(message.text).toBe(op.text);
  // Its HTML is in the element's; a file of its own only without that.
  expect(message.attachments.map((a) => a.name)).toEqual(['element.html']);
  const alone = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op: { ...op, pointed } });
  const { attachments } = (await team.thread(alone.json.model.tasks.at(-1)!.id)).message;
  expect(attachments).toEqual([expect.objectContaining({ name: 'pointed.html', size: pointed.html.length })]);
});

test('says the source it rendered through, and attaches its HTML as it rendered', async () => {
  const { post, target } = setup('around');
  // A component with no element of its own around this one has only its name; past the third is the app's shell.
  const chain = ['ParticipantsField (src/ParticipantsField.tsx:20)', 'WorkflowPanel', 'src/SidePanel.tsx:12', 'src/App.tsx:40'];
  const html = '<h1 class="text-4xl" data-deictic="src/App.tsx:1:26">Pricing</h1>';
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op: { ...op, chain, html } });
  const { message } = await team.thread(json.model.tasks[0]!.id);
  // A label, from the element's own place (`deictic.at`) out; the words are what was typed.
  expect(message.labels['deictic.source']).toBe('ParticipantsField (src/ParticipantsField.tsx:20) ← WorkflowPanel ← src/SidePanel.tsx:12');
  expect(message.text).toBe(op.text);
  // The HTML is a file, for whoever looks into it: the task's words stay short.
  expect(message.attachments).toEqual([expect.objectContaining({ name: 'element.html', type: 'text/html', size: html.length })]);
  // What was typed is all the panel lists.
  expect(json.model.tasks[0]).toMatchObject({ text: op.text });

  // Past what a label holds, the farthest are left out, not cut.
  const long = [`Field (src/${'f'.repeat(140)}.tsx:1)`, `Panel (src/${'p'.repeat(140)}.tsx:2)`];
  const cut = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op: { ...op, chain: long } });
  expect((await team.thread(cut.json.model.tasks.at(-1)!.id)).message.labels['deictic.source']).toBe(long[0]);

  // With the HTML alone, the text is what was typed.
  const plain = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op: { ...op, html } });
  expect((await team.thread(plain.json.model.tasks[1]!.id)).message.text).toBe(op.text);
});

test("lists an element's own tasks, not its file's others, and keeps them as it moves", async () => {
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
  // The file's other elements' tasks aren't this one's: the drawer lists them all.
  expect((await read('h1', 'src/Other.tsx')).tasks).toEqual([]);

  // Lines above change, and the page is loaded again: the headline's task is still its own, by its tag and line.
  p.write('src/App.tsx', page('// Prices\n\n'));
  const after = await read('h1');
  expect(after.tasks).toEqual([expect.objectContaining({ title: 'The headline', open: true, at: { line: 3, column: 5, tag: 'h1' } })]);
  // A row's line is there twice, so its task can't be told to be either's; the old one, with no file, is found at its place only.
  expect((await read('li')).tasks).toEqual([]);
});

test('answers the page its tasks: those still to do with their places, then those lately over', async () => {
  const { p, post, get } = setup(
    'pins',
    {},
    { 'src/App.tsx': 'export const App = () => (\n  <main>\n    <h1 className="text-4xl">Pricing</h1>\n    <li>One</li>\n  </main>\n);\n' },
  );
  const add = async (tag: string, text: string, more = {}) =>
    (
      await post<{ model: Model }>('apply', { plugin: 'tasks', target: p.target('src/App.tsx', tag), op: { ...op, text, ...more } })
    ).json.model.tasks.at(-1)!.id;
  const listed = async () => (await get<{ channel: string; tasks: Listed[] }>('plugins/tasks/page')).tasks;
  await add('h1', 'The headline');
  const row = await add('li', 'The first row');
  const done = await add('li', 'Done already');
  await (await team.tasks.claim(done)).complete('It was already');
  // One about the page has no place, and is listed all the same; one that isn't deictic's is not.
  await post('apply', {
    plugin: 'tasks',
    target: p.target('src/App.tsx', 'h1'),
    op: { ...op, text: 'The page is slow', count: 0, detached: true },
  });
  await team.tasks.create('pins', 'Not about an element');

  expect((await listed()).map((t) => [t.title, t.place, t.state])).toEqual([
    ['The headline', 'src/App.tsx:3:5', 'ready'],
    ['The first row', 'src/App.tsx:4:5', 'ready'],
    ['The page is slow', undefined, 'ready'],
    ['Done already', 'src/App.tsx:4:5', 'completed'],
  ]);
  // What it came to is said, and its thread's newest reply named, for the page to tell what's unread.
  expect((await listed()).at(-1)).toMatchObject({ id: done, tag: 'li', said: 'It was already', open: false });
  await team.as('codex').tasks.claim(row);
  const reply = await team.as('codex').reply(row, 'On it');
  expect((await listed())[1]).toMatchObject({ id: row, state: 'claimed', by: 'codex', open: false, replies: 1, last: reply.id });
});

test("reads a task's thread, and answers in it", async () => {
  const { post, get, target } = setup('thread');
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op });
  const { id } = json.model.tasks[0]!;
  await team.as('codex').reply(id, 'Which headline, the first?');

  const before = await get<Thread>(`plugins/tasks/thread/${id}`);
  expect(before.task).toMatchObject({ id, place: 'src/App.tsx:1:26', tag: 'h1', replies: 1 });
  expect(before.replies).toEqual([
    {
      id: expect.any(String),
      by: 'codex',
      kind: expect.any(String),
      text: 'Which headline, the first?',
      at: expect.any(String),
      files: [],
    },
  ]);

  const after = await post<Thread>(`plugins/tasks/reply/${id}`, { text: ' The first.\n' });
  expect(after.json.replies.map((r) => r.text)).toEqual(['Which headline, the first?', 'The first.']);
  expect(after.json.task).toMatchObject({ replies: 2, last: after.json.replies[1]!.id });
  expect((await team.thread(id)).replies.map((r) => r.text)).toEqual(['Which headline, the first?', 'The first.']);
  expect((await post(`plugins/tasks/reply/${id}`, { text: ' ' })).json.problem).toBe('say something first');
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

test("edits a task's words from the drawer, keeping what follows them", async () => {
  const { post, target } = setup('edit');
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op });
  const { id } = json.model.tasks[0]!;
  // As a task added before what's attached was labels says it after its words.
  await team.edit(id, `${op.text}\n---\nPointed at, inside it: \`span.icon\``);
  const before = (await team.thread(id)).message.text;

  const edited = await post<Thread>(`plugins/tasks/edit/${id}`, { text: 'Keep the headline on one line' });
  expect(edited.json.task).toMatchObject({ id, title: 'Keep the headline on one line', text: 'Keep the headline on one line' });
  expect((await team.thread(id)).message.text).toBe(`Keep the headline on one line${before.slice(op.text.length)}`);
  expect((await post(`plugins/tasks/edit/${id}`, { text: ' ' })).json.problem).toBe('say what should change first');
});

test('deletes a task from the drawer by canceling it', async () => {
  const { post, target } = setup('remove');
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op });
  const { id } = json.model.tasks[0]!;

  expect((await post(`plugins/tasks/remove/${id}`)).status).toBe(200);
  expect((await team.thread(id)).message.task?.state).toBe('canceled');
  expect((await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model.tasks).toEqual([]);
});

test("changes only an open task of the channel's own", async () => {
  const { post, target } = setup('own');
  const { json } = await post<{ model: Model }>('apply', { plugin: 'tasks', target, op });
  const { id } = json.model.tasks[0]!;
  const other = (await team.tasks.create('elsewhere', 'Not one of ours')).task.id;
  for (const route of ['remove', 'edit', 'reply', 'thread']) {
    expect((await post(`plugins/tasks/${route}/${other}`, { text: 'x' })).json.problem).toBe(
      `#${other} isn't a task of deictic's in #own: reload the page for the ones that are`,
    );
  }

  await team.tasks.claim(id);
  expect((await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model.tasks[0]).toMatchObject({ open: false });
  expect((await post(`plugins/tasks/remove/${id}`)).json.problem).toMatch(/ is claimed by .+ now: cancel it on the board/);
  expect((await post(`plugins/tasks/edit/${id}`, { text: 'x' })).json.problem).toMatch(/ now: edit it on the board/);
  // Answering one someone has is what a thread is for.
  expect((await post<Thread>(`plugins/tasks/reply/${id}`, { text: 'One more thing' })).json.replies).toHaveLength(1);
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
    threads: team.threads,
    reply: (...said: Parameters<typeof team.reply>) => team.reply(...said),
    download: (...asked: Parameters<typeof team.download>) => team.download(...asked),
    edit: team.edit,
    actors: team.actors,
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

test('says who watches the channel from the project, while their watch still says so', async () => {
  const { p, post, target } = setup('watched');
  const watching = async () => (await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model.watching;
  const watch = (pid: number, name: string, channel: string, at: number) => {
    const file = join(p.root, '.deictic', 'watchers', `${pid}.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ name, channel, pid, at }));
    return file;
  };
  // A board that isn't this machine's own may be watched from elsewhere: nothing is said of it.
  expect(await watching()).toBeUndefined();

  watch(1, 'claude', 'watched', Date.now());
  watch(2, 'codex', 'another', Date.now());
  const killed = watch(3, 'gone', 'watched', Date.now() - 5 * 60_000);
  expect(await watching()).toEqual(['claude']);
  expect(existsSync(killed)).toBe(false);

  // An agent at work on a task is there too, with no watch running, until the task is done.
  const added = async () => (await post<{ model: Model }>('apply', { plugin: 'tasks', target, op })).json.model.tasks.at(-1)!.id;
  const claim = await team.as('codex').tasks.claim(await added());
  expect(await watching()).toEqual(['claude', 'codex']);
  await claim.complete('done');
  expect(await watching()).toEqual(['claude']);
});

test('says who holds a task, while it is claimed', async () => {
  const { post, target } = setup('held');
  const listed = async () => (await post<{ model: Model }>('read', { plugin: 'tasks', target })).json.model.tasks;
  const { id } = (await post<{ model: Model }>('apply', { plugin: 'tasks', target, op })).json.model.tasks.at(-1)!;
  expect((await listed())[0]!.by).toBeUndefined();

  const claim = await team.as('codex').tasks.claim(id);
  expect(await listed()).toEqual([expect.objectContaining({ id, state: 'claimed', by: 'codex' })]);

  await claim.complete('done');
  // A board's record of a task keeps no one for its end.
  expect(await listed()).toEqual([expect.not.objectContaining({ by: expect.anything() })]);
});

test("posts deictic's problems as tasks, one while it's open, which the drawer lists", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { post, get } = setup('problems');
    const problem = {
      key: 'packages:rrweb',
      kind: 'setup',
      plugin: 'recordings',
      message: 'install what recordings needs, then restart the dev server: npm install -D rrweb',
      details: 'Cannot find module rrweb',
    };
    const posted = async (key = problem.key) => {
      for (let tries = 0; tries < 50; tries++) {
        const { tasks } = await team.tasks.list({ channel: 'problems', label: { 'deictic.problem': key }, state: 'all' });
        if (tasks.length > 0) return tasks.map(({ message }) => message);
        await Bun.sleep(20);
      }
      return [];
    };
    expect((await post('problem', problem)).status).toBe(200);
    const [task] = await posted();
    expect(task!.text).toBe(
      'Install what recordings needs, then restart the dev server: npm install -D rrweb\n\n' +
        "Reported by deictic's recordings plugin, about the project's setup: fix it as it says, then restart the dev server and check it's gone." +
        '\n---\n```\nCannot find module rrweb\n```',
    );
    expect(task!.labels).toMatchObject({
      team: 'web',
      'deictic.problem': 'packages:rrweb',
      'deictic.problem.kind': 'setup',
      'deictic.problem.plugin': 'recordings',
    });
    const listed = (await get<{ tasks: Listed[] }>('plugins/tasks/page')).tasks;
    expect(listed).toMatchObject([{ id: task!.id, problem: 'setup', text: expect.stringMatching(/check it's gone\.$/) }]);

    // A dev server started again finds it again: still one task while it's open, and a new one once it's over.
    const again = setup('problems');
    await again.post('problem', problem);
    await Bun.sleep(100);
    expect(await posted()).toHaveLength(1);
    await (await team.tasks.claim(task!.id)).complete('Installed');
    await setup('problems').post('problem', problem);
    await Bun.sleep(100);
    expect(await posted()).toHaveLength(2);

    // A bug says to report it, not to patch deictic where it's installed; `problems: false` posts none.
    await post('problem', { key: 'error:read:boom', kind: 'bug', message: '/__deictic/read failed: boom' });
    expect((await posted('error:read:boom'))[0]!.text).toContain("not in this project: don't change it where it's installed");
    await setup('problems', { problems: false }).post('problem', { ...problem, key: 'quiet' });
    await Bun.sleep(100);
    expect(await posted('quiet')).toEqual([]);
  } finally {
    console.warn = warn;
  }
});
