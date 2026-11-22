/**
 * `deictic task`: a task, briefly: what was asked, where (and whether that place has moved in the source since), the
 * page, what's attached with the command to look at each, the replies, and the other open tasks about the same page.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { deicticDirs, download, ME, type Message, read, vbJson } from './board.ts';

/** An actor by the profile its ID ends in (`…+claude`), or the ID of one that writes as itself. */
const nameOf = (actor: string) => (actor.includes('+') ? actor.slice(actor.lastIndexOf('+') + 1) : actor);

export function run(id: string, values: { out?: string }): void {
  const { message: root, replies } = read(id);
  const [asked = '', where = ''] = root.text.split(/\n---\n/);
  const label = (key: string) => root.labels[key];
  const at = label('deictic.at');

  // Who asked, said as that: the line's state is beside it, and a board's record names no one for a task's end.
  console.log(`#${root.id} ${root.task?.state ?? 'not a task'}, asked by ${root.author?.handle ?? root.by.actor}, ${root.createdAt}`);
  const claim = root.task?.claim;
  if (claim) console.log(`Claimed by ${nameOf(claim.actor)} until ${claim.until}`);
  if (root.task?.result !== undefined) console.log(`Result: ${root.task.result}`);
  if (root.task?.reason !== undefined) console.log(`Reason: ${root.task.reason}`);
  console.log(`\nAsked:\n${asked.trim()}\n`);
  // The part inside the element that was pointed at, where nothing marked it: what the person means.
  const pointed = /\nPointed at, inside it: `([^`]*)`\n`{3,}\w*\n([\s\S]*?)\n`{3,}/.exec(where);
  // Where, from the labels: the place, the page, and the viewport to look at it in.
  const facts: [string, (v: string) => string | undefined][] = [
    ['deictic.project', (v) => `Project ${v}`],
    ['deictic.at', (v) => `${v} <${label('deictic.tag') ?? '?'}>`],
    ['deictic.url', (v) => v],
    ['deictic.viewport', (v) => `Viewport ${v}`],
    ['deictic.count', (v) => (v === '1' ? undefined : `${v} elements on the page come from that line`)],
    ['deictic.position', (v) => `In the screenshot at x,y ${v}, ${label('deictic.size') ?? '?'} (CSS pixels from its top left)`],
  ];
  for (const [key, say] of facts) {
    const value = label(key);
    const line = value === undefined ? undefined : say(value);
    if (line !== undefined) console.log(line);
  }
  // What no label holds: what's attached and drawn on it.
  const told = (pointed ? where.slice(0, pointed.index) : where).trim();
  if (told !== '') console.log(told);
  if (pointed) console.log(`\nPointed at, inside it: ${pointed[1]}\n  ${pointed[2]}`);

  if (at !== undefined) placeOf(at, label('deictic.line'));
  attachments(root, values.out === undefined ? undefined : resolve(values.out));

  if (replies.length > 0) console.log('\nReplies:');
  for (const r of replies) console.log(`  ${r.author?.handle ?? r.by.actor}: ${r.text}`);
  others(root);
}

/** The place as the task saw it, against the file now: the element's opening tag may have moved or changed. */
function placeOf(at: string, first: string | undefined): void {
  const file = at.replace(/:\d+:\d+$/, '');
  const line = Number(at.split(':').at(-2));
  // Marks are from the dev server's root: here, above, or a folder with a .deictic/ of its own.
  const roots = [process.cwd(), ...deicticDirs().map(dirname)];
  const path = roots.map((r) => resolve(r, file)).find((p) => existsSync(p));
  if (path === undefined) {
    console.log(`\n${file} isn't under ${roots.join(' or ')}: find the dev server's root.`);
    return;
  }
  const lines = readFileSync(path, 'utf8').split('\n');
  // The tag's first line may follow other code on its line: `const App = () => <h1>`.
  const now = lines[line - 1]?.trim();
  if (first === undefined || now?.includes(first.slice(0, 40))) {
    console.log(`\nFile: ${path}:${line}, as the task saw it.`);
    return;
  }
  const moved = lines.findIndex((l) => l.includes(first.slice(0, 40)));
  console.log(
    moved >= 0
      ? `\nFile: moved to ${path}:${moved + 1} (the task says line ${line}).`
      : `\nFile: ${path}:${line} no longer reads as the task saw it; it was:\n  ${first}`,
  );
}

/** What's attached, with the command to look at each, downloaded to `out` where it's given. */
function attachments(root: Message, out: string | undefined): void {
  if (root.attachments.length > 0) console.log('\nAttached:');
  if (out !== undefined) mkdirSync(out, { recursive: true });
  for (const a of root.attachments) {
    const kb = `${Math.round(a.size / 1024)} KB`;
    if (out !== undefined) download(a, join(out, a.name));
    const saved = out === undefined ? '' : ` → ${join(out, a.name)}`;
    // To a file's path: the CLI writes what it's given, and refuses a folder.
    const get = saved || `: ${ME} vb download ${a.id} ${a.name}`;
    if (a.name.startsWith('recording-')) {
      console.log(`  ${a.name} (${kb})${saved}`);
      console.log(`    timeline: ${ME} recording ${root.id}`);
      console.log(`    frames:   ${ME} frame ${root.id}`);
    } else if (a.name.startsWith('voice-')) {
      console.log(`  ${a.name} (${kb}), a voice clip${saved}`);
      console.log(`    speech:   ${ME} voice ${root.id}`);
    } else if (a.name === 'element.html') {
      console.log(`  ${a.name} (${kb}), the element's HTML as it rendered, if you need it${get}`);
    } else {
      console.log(`  ${a.name} (${a.type}, ${kb})${get}`);
    }
  }
}

/** The other open tasks about the same page, of the same project: left a minute apart, they're often one change. */
function others(root: Message): void {
  const page = root.labels['deictic.page'];
  if (page === undefined) return;
  const project = root.labels['deictic.project'];
  const labels = [`deictic.page=${page}`, ...(project === undefined ? [] : [`deictic.project=${project}`])];
  const { tasks } = vbJson<{ tasks: { message: Message }[] }>(['tasks', root.channel, ...labels.flatMap((l) => ['--label', l])]);
  const rest = tasks.map((t) => t.message).filter((m) => m.id !== root.id);
  if (rest.length === 0) return;
  console.log(
    `\n${rest.length} other open task${rest.length === 1 ? '' : 's'} on ${page}: read them before you start, they may be one change.`,
  );
  for (const m of rest) {
    const title = (m.text.split(/\n---\n/)[0] ?? '').split('\n')[0]?.slice(0, 100);
    console.log(`  #${m.id} ${m.task?.state ?? ''}, ${m.labels['deictic.at'] ?? '?'}: ${title}`);
  }
}
