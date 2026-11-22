/**
 * The dev server's stand-in on the deployed site, which has none: `deictic/vite`'s `standalone` (in
 * `vite.config.ts`, for a build) hands the overlay's requests to this, in the page, so Alt-click works there as a demo.
 *
 * Nothing is written anywhere. Tasks, shots and recordings are kept in the page and gone with it (a recording
 * going on, and the voice clips, in the browser for a day, so one carries on from this page to the site's next); a
 * class edit changes the element, not a file, and without Tailwind to ask the Tailwind tab is its plain one. Undo and
 * redo work on what was done here. There's no editor to open. A recording replays in `replay.html`, which the build
 * publishes (`replay.ts`, beside `vite.config.ts`) and which asks this page for it.
 */
import type { Standalone, Target } from 'deictic';
import type { Model as Classes, Op as ClassOp } from 'deictic/tailwind';
import type { Change, Model as Tasks, Task } from 'deictic/tasks';

interface Body {
  plugin: string;
  target: Target;
  op?: unknown;
}

/** A change made here: what the popup calls it, and what takes it back and makes it again. */
interface Step {
  label: string;
  undo: () => void;
  redo: () => void;
}

const PREFIX = '__deictic/';
/** Each element's tasks, by its place (`file:line:column`). */
const tasks = new Map<string, Task[]>();
/** Each plugin's changes on each element, as the dev server's history keeps them by scope. */
const history = new Map<string, { done: Step[]; undone: Step[] }>();
/** The recordings made here, for the replay page to ask for. */
const recordings = new Map<string, unknown>();
let made = 0;
let added = 0;

const placeOf = ({ file, line, column }: Target['loc']) => `${file}:${line}:${column}`;
const refuse = (problem: string, status = 422) => Response.json({ problem }, { status });

function stepsOf(plugin: string, place: string) {
  const scope = `${plugin} ${place}`;
  const steps = history.get(scope) ?? { done: [], undone: [] };
  history.set(scope, steps);
  return steps;
}

/** A place's file, and its line and column. */
const PLACE = /^(.*):(\d+):(\d+)$/;

function readTasks(place: string): Tasks {
  const file = PLACE.exec(place)?.[1];
  // The file's other elements' tasks, each with its place: the tag is the page's to say, with no source to read.
  const elsewhere = [...tasks].flatMap(([other, list]) => {
    const [, its, line, column] = PLACE.exec(other) ?? [];
    if (other === place || its !== file) return [];
    const at = { line: Number(line), column: Number(column), tag: elementsAt(other)[0]?.localName ?? '' };
    return list.map((task) => ({ ...task, at }));
  });
  return { channel: 'deictic', tasks: tasks.get(place) ?? [], elsewhere: elsewhere.sort((a, b) => a.at.line - b.at.line) };
}

function changeTasks(place: string, change: Change): Step {
  const before = tasks.get(place) ?? [];
  const titleOf = (text: string) => text.split('\n')[0] ?? '';
  const put = (list: Task[]) => () => void tasks.set(place, list);
  const step = (what: string, after: Task[]): Step => ({ label: what, undo: put(before), redo: put(after) });
  if ('edit' in change) {
    const { edit, text } = change;
    return step(
      `edit ${edit}`,
      before.map((task) => (task.id === edit ? { ...task, text, title: titleOf(text) } : task)),
    );
  }
  if ('remove' in change) {
    const { remove } = change;
    return step(
      `delete ${remove}`,
      before.filter((task) => task.id !== remove),
    );
  }
  const task: Task = { id: `demo-${++added}`, title: titleOf(change.text), text: change.text, state: 'ready', open: true };
  return step(`add "${task.title}"`, [...before, task]);
}

/** Every element rendered from a place: a list's rows share one. */
const elementsAt = (place: string) => [...document.querySelectorAll(`[data-deictic="${CSS.escape(place)}"]`)];

/** The classes the element has now: all the page can say of them, with no source to read. */
const readClasses = (place: string): Classes => ({ editable: true, classes: elementsAt(place)[0]?.getAttribute('class') ?? '' });

function changeClasses(place: string, { classes }: ClassOp): Step {
  const elements = elementsAt(place);
  const before = elements.map((element) => element.getAttribute('class') ?? '');
  return {
    label: 'classes',
    undo: () => elements.forEach((element, i) => element.setAttribute('class', before[i]!)),
    redo: () => elements.forEach((element) => element.setAttribute('class', classes)),
  };
}

const models: Record<string, (place: string) => unknown> = { tasks: readTasks, tailwind: readClasses };
const changes: Record<string, (place: string, op: never) => Step> = { tasks: changeTasks, tailwind: changeClasses };

/** A shot, as its `add` route would keep it: here, for as long as the page is open, at a URL of the page's own. */
async function keepShot(request: Request): Promise<Response> {
  const type = request.headers.get('content-type') ?? '';
  if (type !== 'image/png') return refuse('send the shot as image/png: the `dom()` renderer does', 415);
  return Response.json({ id: idOf('shot'), url: URL.createObjectURL(new Blob([await request.arrayBuffer()], { type })) });
}

/** Unlike any other tab's, as a replay asks every page of the site for a recording by it. */
const idOf = (kind: string) => `${kind}-${++made}-${crypto.randomUUID().slice(0, 8)}`;

/** What's kept past the page, as it's kept: with when, to go a day on. */
interface Held<T> {
  value: T;
  at: number;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * What a recording needs on the site's next page, where it carries on: its parts so far, and the mic's clips.
 * In the browser's IndexedDB, as a page keeps nothing past itself, each for a day.
 */
function held<T>(name: 'parts' | 'clips', mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((done, fail) => {
    const opening = indexedDB.open('deictic-demo', 1);
    opening.onupgradeneeded = () => {
      opening.result.createObjectStore('parts');
      opening.result.createObjectStore('clips');
    };
    opening.onerror = () => fail(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction(name, mode);
      transaction.oncomplete = transaction.onabort = () => db.close();
      const request = work(transaction.objectStore(name));
      request.onerror = () => fail(request.error);
      request.onsuccess = () => done(request.result);
    };
  });
}

/** Puts `value` under `key`, and drops what's been there a day. */
const hold = (name: 'parts' | 'clips', key: string, value: unknown) =>
  held(name, 'readwrite', (store) => {
    store.openCursor().onsuccess = function () {
      const cursor = this.result;
      if (cursor === null) return;
      if (Date.now() - (cursor.value as Held<unknown>).at > DAY) cursor.delete();
      cursor.continue();
    };
    return store.put({ value, at: Date.now() } satisfies Held<unknown>, key);
  });

/** A recording's keys among the parts: what it began with (`meta`), and each part by its place. */
const partsOf = (id: string) => IDBKeyRange.bound(`${id}/`, `${id}/￿`);

const clipOf = async (id: string) => (await held<Held<Blob> | undefined>('clips', 'readonly', (store) => store.get(id)))?.value;

/** The voice plugin's `add` and `more/<id>`: a take as it's spoken, its audio so far kept whole. */
async function keepClip(request: Request, id = idOf('clip')): Promise<Response> {
  const before = await clipOf(id);
  const type = before?.type ?? request.headers.get('content-type') ?? '';
  const clip = new Blob([...(before === undefined ? [] : [before]), await request.arrayBuffer()], { type });
  await hold('clips', id, clip);
  return Response.json({ id, url: URL.createObjectURL(clip) });
}

/** The recordings plugin's `begin`, `part/<id>`, `end/<id>` and `discard/<id>`. */
async function record(request: Request, step: string, id: string | undefined, seq: string | null): Promise<Response> {
  if (step === 'begin') {
    const begun = idOf('recording');
    await hold('parts', `${begun}/meta`, await request.json());
    return Response.json({ id: begun });
  }
  if (id === undefined) return refuse(`no recording to ${step}`, 404);
  if (step === 'part') {
    await hold('parts', `${id}/${seq}`, { seq: Number(seq), events: await request.json() });
    return Response.json({ id });
  }
  const parts = await held<Held<unknown>[]>('parts', 'readonly', (store) => store.getAll(partsOf(id)));
  await held('parts', 'readwrite', (store) => store.delete(partsOf(id)));
  if (step === 'discard') return Response.json({ id });
  // `meta` sorts after every part's place, which is digits.
  const meta = parts.pop()?.value as object | undefined;
  const events = (parts.map((part) => part.value) as { seq: number; events: unknown[] }[])
    .sort((a, b) => a.seq - b.seq)
    .flatMap((part) => part.events);
  if (meta === undefined || events.length === 0) return refuse('the recording has no events: record for a moment longer', 400);
  recordings.set(id, { ...meta, ...((await request.json()) as object), events });
  return Response.json({ id, url: `${import.meta.env.BASE_URL}replay.html?id=${id}` });
}

// A replay is a document of its own, a frame of this page or another tab: it asks for its recording, and each
// of its voice clips, on this channel (`CHANNEL`, in `replay.ts`), and the page that has it answers.
const channel = new BroadcastChannel('deictic-demo');
channel.addEventListener('message', ({ data }: MessageEvent<{ ask?: string; id: string }>) => {
  const answer = (found: unknown) => found !== undefined && channel.postMessage({ answer: data.ask, id: data.id, found });
  if (data.ask === 'recording') answer(recordings.get(data.id));
  if (data.ask === 'clip') void clipOf(data.id).then(answer);
});

const standalone: Standalone = async (request) => {
  const url = new URL(request.url);
  const route = url.pathname.slice(url.pathname.indexOf(PREFIX) + PREFIX.length);
  // A plugin's own route: `plugins/<name>/<route>`, and what it's about after that.
  const [, of, asked, id] = /^plugins\/(\w+)\/(\w+)(?:\/([\w-]+))?$/.exec(route) ?? [];
  if (of === 'screenshots' && asked === 'add') return keepShot(request);
  if (of === 'voice' && asked === 'add') return keepClip(request);
  if (of === 'voice' && asked === 'more') return keepClip(request, id);
  if (of === 'recordings' && asked !== undefined) return record(request, asked, id, url.searchParams.get('seq'));
  if (route === 'open') return refuse('this is the deployed demo: there is no editor to open here', 404);
  if (route === 'history') {
    const place = `${url.searchParams.get('file')}:${url.searchParams.get('line')}:${url.searchParams.get('column')}`;
    const { done, undone } = stepsOf(url.searchParams.get('plugin') ?? '', place);
    return Response.json({ done: done.map(({ label }) => ({ label })), undone: undone.map(({ label }) => ({ label })) });
  }
  if (request.method !== 'POST' || !['read', 'apply', 'undo', 'redo'].includes(route))
    return new Response(`no endpoint ${url.pathname} on the deployed demo`, { status: 404 });

  const { plugin, target, op } = (await request.json()) as Body;
  const place = placeOf(target.loc);
  const model = () => models[plugin]?.(place) ?? null;
  if (route === 'read') return Response.json({ model: model() });
  const steps = stepsOf(plugin, place);
  if (route === 'apply') {
    const change = changes[plugin];
    if (change === undefined) return refuse(`${plugin} changes nothing from its panel`);
    const step = change(place, op as never);
    step.redo();
    steps.done.push(step);
    // A new change is what comes next: what was undone before it can't be done again.
    steps.undone.length = 0;
    return Response.json({ model: model(), change: { label: `${plugin} ${target.loc.file}:${target.loc.line}: ${step.label}` } });
  }
  const [from, to] = route === 'undo' ? [steps.done, steps.undone] : [steps.undone, steps.done];
  const step = from.pop();
  if (step === undefined) return refuse(`nothing to ${route}`);
  step[route === 'undo' ? 'undo' : 'redo']();
  to.push(step);
  return Response.json({ change: { label: step.label } });
};

export default standalone;
