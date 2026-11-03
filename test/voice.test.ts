import { afterAll, expect, test } from 'bun:test';

import { board } from '@vercel/board';
import { local } from '@vercel/board/backend-local';

import { type Kept, recordings } from '#src/plugins/recordings/index.ts';
import { type Model, tasks } from '#src/plugins/tasks/index.ts';
import { voice } from '#src/plugins/voice/index.ts';
import { endpoints, redirect } from '#src/tools/endpoints.ts';

import { project } from './fixture.ts';

const ORIGIN = 'http://localhost:5173';
const AUDIO = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
const backend = local({ memory: true });
const team = board({ backend });
afterAll(() => backend.close());

function setup(options: Parameters<typeof voice>[0] = {}) {
  const p = project({ 'src/App.tsx': 'export const App = () => <h1>Pricing</h1>;\n' });
  const handle = endpoints({
    root: p.root,
    plugins: [voice(options), recordings(), tasks({ board: team, channel: 'voice' })],
    open: () => redirect('/'),
  });
  const ask = (path: string, init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}) =>
    handle(new Request(`${ORIGIN}/__deictic/${path}`, { ...init, headers: { origin: ORIGIN, ...init.headers } })).then((r) => r!);
  const post = async (route: string, body: BodyInit, type: string) => {
    const res = await ask(route, { method: 'POST', headers: { 'content-type': type }, body });
    return { status: res.status, ...((await res.json()) as { id?: string; problem?: string }) };
  };
  return { p, ask, add: (body: BodyInit = AUDIO, type = 'audio/webm;codecs=opus') => post('plugins/voice/add', body, type), post };
}

test('keeps a take the page recorded, as its audio type, and plays it back', async () => {
  const { ask, add } = setup();
  const { id } = await add();
  expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  const clip = await ask(`plugins/voice/clip/${id}`);
  expect(clip.headers.get('content-type')).toBe('audio/webm');
  expect(new Uint8Array(await clip.arrayBuffer())).toEqual(AUDIO);
  const { id: safari } = await add(AUDIO, 'audio/mp4');
  expect((await ask(`plugins/voice/clip/${safari}`)).headers.get('content-type')).toBe('audio/mp4');
  expect((await ask('plugins/voice/clip/nope')).status).toBe(404);
});

test('takes only audio a browser records, not empty, and keeps the latest few', async () => {
  const { ask, add } = setup({ keep: 2 });
  expect(await add(AUDIO, 'audio/wav')).toMatchObject({ status: 415, problem: 'send the clip as audio/webm, audio/ogg, audio/mp4' });
  expect(await add(new Uint8Array())).toMatchObject({ status: 400, problem: 'the clip is empty: speak for a moment longer' });
  const [first, second, third] = [await add(), await add(), await add()];
  expect((await ask(`plugins/voice/clip/${first.id}`)).status).toBe(404);
  expect((await ask(`plugins/voice/clip/${second.id}`)).status).toBe(200);
  expect((await ask(`plugins/voice/clip/${third.id}`)).status).toBe(200);
});

test('a task attaches voice notes, and a recording’s voice, saying what each is', async () => {
  const { p, ask, add, post } = setup();
  const [note, spoken] = [await add(), await add()];
  const kept: Kept = {
    page: `${ORIGIN}/`,
    viewport: { width: 800, height: 600 },
    startedAt: 0,
    duration: 9_000,
    events: [{ type: 4, data: {}, timestamp: 0 }],
    voice: [{ id: spoken.id!, at: 1_000, duration: 3_000 }],
  };
  const { id: recorded } = await post('plugins/recordings/add', JSON.stringify(kept), 'application/json');
  const replay = `${ORIGIN}/__deictic/plugins/recordings/replay/${recorded}`;
  const res = await ask('apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      plugin: 'tasks',
      target: p.target('src/App.tsx', 'h1'),
      op: {
        text: 'Too quiet',
        page: `${ORIGIN}/`,
        viewport: { width: 800, height: 600 },
        html: '<h1>Pricing</h1>',
        count: 1,
        recordings: [{ id: recorded, duration: 9_000, replay, voice: [spoken.id] }],
        voice: [{ id: note.id, duration: 5_400 }],
      },
    }),
  });
  const { model } = (await res.json()) as { model: Model };
  const { message } = await team.thread(model.tasks.at(-1)!.id);
  expect(message.text).toContain(
    `A recording, 0:09 long, attached as rrweb events, with the voice (voice-${spoken.id}); it replays at ${replay}`,
  );
  expect(message.text).toContain(`A voice note, 0:05 long, attached as voice-${note.id}`);
  expect(message.attachments?.map((a) => [a.name, a.type])).toEqual([
    [`recording-${recorded}.json`, 'application/json'],
    [`voice-${spoken.id}.webm`, 'audio/webm'],
    [`voice-${note.id}.webm`, 'audio/webm'],
  ]);
});
