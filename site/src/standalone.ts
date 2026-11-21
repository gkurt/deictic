/**
 * The dev server's stand-in on the deployed site, which has none: `deictic/vite`'s `standalone` (in
 * `vite.config.ts`, for a build) hands the overlay's requests to this, in the page, so Alt-click works there as a demo.
 *
 * Nothing is written anywhere. Tasks, shots, recordings and voice notes are kept in the page and gone with it; a
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
/** The recordings made here, and the voice clips, for the replay page to ask for. */
const recordings = new Map<string, unknown>();
const clips = new Map<string, Blob>();
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

const readTasks = (place: string): Tasks => ({ channel: 'deictic', tasks: tasks.get(place) ?? [] });

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

/** What a plugin's `add` route keeps: here, for as long as the page is open, at a URL of the page's own. */
async function keep(request: Request, kind: string): Promise<Response> {
  const type = request.headers.get('content-type') ?? '';
  if (kind === 'shot' && type !== 'image/png') return refuse('send the shot as image/png: the `dom()` renderer does', 415);
  const blob = new Blob([await request.arrayBuffer()], { type });
  const id = idOf(kind);
  if (kind === 'clip') clips.set(id, blob);
  return Response.json({ id, url: URL.createObjectURL(blob) });
}

/** Unlike any other tab's, as a replay asks every page of the site for a recording by it. */
const idOf = (kind: string) => `${kind}-${++made}-${crypto.randomUUID().slice(0, 8)}`;

// A replay is a document of its own, a frame of this page or another tab: it asks for its recording, and each
// of its voice clips, on this channel (`CHANNEL`, in `replay.ts`), and the page that has it answers.
const channel = new BroadcastChannel('deictic-demo');
channel.addEventListener('message', ({ data }: MessageEvent<{ ask?: string; id: string }>) => {
  const found = data.ask === 'recording' ? recordings.get(data.id) : data.ask === 'clip' ? clips.get(data.id) : undefined;
  if (found !== undefined) channel.postMessage({ answer: data.ask, id: data.id, found });
});

const standalone: Standalone = async (request) => {
  const url = new URL(request.url);
  const route = url.pathname.slice(url.pathname.indexOf(PREFIX) + PREFIX.length);
  if (route === 'plugins/screenshots/add') return keep(request, 'shot');
  if (route === 'plugins/voice/add') return keep(request, 'clip');
  if (route === 'plugins/recordings/add') {
    const id = idOf('recording');
    recordings.set(id, await request.json());
    return Response.json({ id, url: `${import.meta.env.BASE_URL}replay.html?id=${id}` });
  }
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
