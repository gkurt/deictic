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
  // A task not over yet has them, as null.
  if (root.task?.result != null) console.log(`Result: ${root.task.result}`);
  if (root.task?.reason != null) console.log(`Reason: ${root.task.reason}`);
  console.log(`\nAsked:\n${asked.trim()}\n`);
  // The part inside the element that was pointed at, where nothing marked it: what the person means.
  const pointed = /\nPointed at, inside it: `([^`]*)`\n`{3,}\w*\n([\s\S]*?)\n`{3,}/.exec(where);
  // Where, from the labels: the place, the page, and the viewport to look at it in.
  const facts: [string, (v: string) => string | undefined][] = [
    ['deictic.project', (v) => `Project ${v}`],
    ['deictic.at', (v) => `${v} <${label('deictic.tag') ?? '?'}>`],
    // From its own line out: before the label, tasks said it in their text, which is printed below as it is.
    ['deictic.source', (v) => `Source: ${at?.replace(/:\d+$/, '') ?? '?'} ← ${v}`],
    ['deictic.url', (v) => v],
    ['deictic.viewport', (v) => `Viewport ${v}`],
    ['deictic.count', (v) => (v === '1' ? undefined : `${v} elements on the page come from that line`)],
    [
      'deictic.point',
      // Circled only in a shot taken of the element as the task went, which is the one that says where the element is.
      (v) =>
        `About the spot at x,y ${v} in that element (CSS pixels from its top left)${label('deictic.screenshot.1.position') === undefined ? '' : ', circled in the screenshot'}`,
    ],
    // A task added before shots were numbered had its one shot's place here.
    ['deictic.position', (v) => `In the screenshot at x,y ${v}, ${label('deictic.size') ?? '?'} (CSS pixels from its top left)`],
  ];
  for (const [key, say] of facts) {
    const value = label(key);
    const line = value === undefined ? undefined : say(value);
    if (line !== undefined) console.log(line);
  }
  for (const line of drawn(root)) console.log(line);
  // A task added before these were labels says them after its words.
  const told = (pointed ? where.slice(0, pointed.index) : where).trim();
  if (told !== '') console.log(told);
  if (pointed) console.log(`\nPointed at, inside it: ${pointed[1]}\n  ${pointed[2]}`);
  const path = label('deictic.pointed');
  if (path !== undefined) {
    const file = root.attachments.some((a) => a.name === 'pointed.html') ? 'pointed.html' : 'element.html';
    console.log(`\nPointed at, inside it: ${path} (its HTML is in ${file})`);
  }

  if (at !== undefined) placeOf(at, label('deictic.line'));
  attachments(root, values.out === undefined ? undefined : resolve(values.out));

  if (replies.length > 0) console.log('\nReplies:');
  for (const r of replies) console.log(`  ${r.author?.handle ?? r.by.actor}: ${r.text}`);
  others(root);
}

/**
 * What the attached files don't say, from the numbered labels: where the element is in each shot and the notes on it, the
 * notes drawn on the page, where each recording replays, and what wasn't kept any more.
 */
function drawn({ labels, attachments }: Message): string[] {
  const numbered = (prefix: string) => {
    const out: string[] = [];
    for (let n = 1; labels[`${prefix}.${n}`] !== undefined; n++) out.push(labels[`${prefix}.${n}`]!);
    return out;
  };
  const notes = (prefix: string) => numbered(`${prefix}.note`).map((note) => JSON.stringify(note));
  const lines: string[] = [];
  // `deictic.screenshot.N` is the Nth PNG attached, `deictic.recording.N` the Nth recording.
  for (const [i, { name }] of attachments.filter((a) => a.type === 'image/png').entries()) {
    const shot = `deictic.screenshot.${i + 1}`;
    const position = labels[`${shot}.position`];
    if (position === undefined) continue;
    const said = notes(shot);
    lines.push(
      `${name}: the element at x,y ${position}, ${labels[`${shot}.size`] ?? '?'} (CSS pixels from its top left)${said.length === 0 ? '' : `; notes drawn on it: ${said.join(', ')}`}`,
    );
  }
  const onPage = notes('deictic');
  if (onPage.length > 0) lines.push(`Notes drawn on the page: ${onPage.join(', ')}`);
  for (const [i, { name }] of attachments.filter((a) => a.name.startsWith('recording-')).entries()) {
    const replay = labels[`deictic.recording.${i + 1}.replay`];
    if (replay !== undefined) lines.push(`${name} replays at ${replay}`);
  }
  const dropped = numbered('deictic.dropped');
  if (dropped.length > 0) lines.push(`Not attached, as it wasn't kept any more: ${dropped.join(', ')}`);
  return lines;
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
