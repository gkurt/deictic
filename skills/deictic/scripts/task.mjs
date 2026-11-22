#!/usr/bin/env node
// A task, briefly: what was asked, where (and whether that place has moved in the source since), the page,
// what's attached with the command to look at each, the replies, and the other open tasks about the same page.
// Usage: task.mjs <id> [--out dir]
// --out downloads the attachments there.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deicticDirs, fail, parseArgs, vb } from './lib.mjs';

const vbScript = join(dirname(fileURLToPath(import.meta.url)), 'vb.mjs');

const { options, rest } = parseArgs(process.argv.slice(2));
if (rest[0] === undefined) fail('Name a task: task.mjs 68');
const { message: root, replies } = vb(['read', rest[0].replace(/^#/, '')], { json: true });
const [asked = '', where = ''] = root.text.split(/\n---\n/);
const at = root.labels['deictic.at'];
const here = dirname(fileURLToPath(import.meta.url));

// Who asked, said as that: the line's state is beside it, and a board's record names no one for a task's end.
console.log(`#${root.id} ${root.task?.state ?? 'not a task'}, asked by ${root.author?.handle ?? root.by.actor}, ${root.createdAt}`);
// An actor by the profile its ID ends in (`…+claude`), or the ID of one that writes as itself.
const nameOf = (actor) => (actor.includes('+') ? actor.slice(actor.lastIndexOf('+') + 1) : actor);
const claim = root.task?.claim;
if (claim) console.log(`Claimed by ${nameOf(claim.actor)} until ${claim.until}`);
if (root.task?.result) console.log(`Result: ${root.task.result}`);
if (root.task?.reason) console.log(`Reason: ${root.task.reason}`);
console.log(`\nAsked:\n${asked.trim()}\n`);
// The part inside the element that was pointed at, where nothing marked it: what the person means.
const pointed = where.match(/\nPointed at, inside it: `([^`]*)`\n`{3,}\w*\n([\s\S]*?)\n`{3,}/);
// Where, from the labels: the place, the page, and the viewport to look at it in.
const facts = [
  ['deictic.project', (v) => `Project ${v}`],
  ['deictic.at', (v) => `${v} <${root.labels['deictic.tag'] ?? '?'}>`],
  ['deictic.url', (v) => v],
  ['deictic.viewport', (v) => `Viewport ${v}`],
  ['deictic.count', (v) => (v === '1' ? undefined : `${v} elements on the page come from that line`)],
  ['deictic.position', (v) => `In the screenshot at x,y ${v}, ${root.labels['deictic.size'] ?? '?'} (CSS pixels from its top left)`],
];
for (const [key, say] of facts) {
  const line = root.labels[key] === undefined ? undefined : say(root.labels[key]);
  if (line !== undefined) console.log(line);
}
// What no label holds: what's attached and drawn on it.
const told = (pointed ? where.slice(0, pointed.index) : where).trim();
if (told !== '') console.log(told);
if (pointed) console.log(`\nPointed at, inside it: ${pointed[1]}\n  ${pointed[2]}`);

// The place as the task saw it, against the file now: the element's opening tag may have moved or changed.
if (at !== undefined) {
  const [file, line] = [at.replace(/:\d+:\d+$/, ''), Number(at.split(':').at(-2))];
  // Marks are from the dev server's root: here, above, or a folder with a .deictic/ of its own.
  const roots = [process.cwd(), ...deicticDirs().map(dirname)];
  const path = roots.map((r) => resolve(r, file)).find((p) => existsSync(p));
  if (path === undefined) {
    console.log(`\n${file} isn't under ${roots.join(' or ')}: find the dev server's root.`);
  } else {
    const lines = readFileSync(path, 'utf8').split('\n');
    // The tag's first line may follow other code on its line: `const App = () => <h1>`.
    const first = root.labels['deictic.line'];
    const now = lines[line - 1]?.trim();
    if (first === undefined || now?.includes(first.slice(0, 40))) {
      console.log(`\nFile: ${path}:${line}, as the task saw it.`);
    } else {
      const moved = lines.findIndex((l) => l.includes(first.slice(0, 40)));
      console.log(
        moved >= 0
          ? `\nFile: moved to ${path}:${moved + 1} (the task says line ${line}).`
          : `\nFile: ${path}:${line} no longer reads as the task saw it; it was:\n  ${first}`,
      );
    }
  }
}

if (root.attachments.length > 0) console.log('\nAttached:');
const out = options.out?.[0] && resolve(options.out[0]);
if (out) mkdirSync(out, { recursive: true });
for (const a of root.attachments) {
  const kb = `${Math.round(a.size / 1024)} KB`;
  if (out) vb(['download', a.id, join(out, a.name)]);
  const saved = out ? ` → ${join(out, a.name)}` : '';
  if (a.name.startsWith('recording-')) {
    console.log(`  ${a.name} (${kb})${saved}`);
    console.log(`    timeline: node ${join(here, 'recording.mjs')} ${root.id}`);
    console.log(`    frames:   node ${join(here, 'frame.mjs')} ${root.id}`);
  } else if (a.name.startsWith('voice-')) {
    console.log(`  ${a.name} (${kb}), a voice clip${saved}`);
    console.log(`    speech:   node ${join(here, 'voice.mjs')} ${root.id}`);
  } else if (a.name === 'element.html') {
    console.log(
      `  ${a.name} (${kb}), the element's HTML as it rendered, if you need it${saved || `: node ${vbScript} download ${a.id} ${a.name}`}`,
    );
  } else {
    // To a file's path: the CLI writes what it's given, and refuses a folder.
    console.log(`  ${a.name} (${a.type}, ${kb})${saved || `: node ${vbScript} download ${a.id} ${a.name}`}`);
  }
}
if (replies.length > 0) console.log('\nReplies:');
for (const r of replies) console.log(`  ${r.author?.handle ?? r.by.actor}: ${r.text}`);

// The other open tasks about the same page, of the same project: left a minute apart, they're often one change.
const page = root.labels['deictic.page'];
if (page !== undefined) {
  const project = root.labels['deictic.project'];
  const labels = [`deictic.page=${page}`, ...(project === undefined ? [] : [`deictic.project=${project}`])];
  const { tasks } = vb(['tasks', root.channel, ...labels.flatMap((l) => ['--label', l])], { json: true });
  const others = tasks.map((t) => t.message).filter((m) => m.id !== root.id);
  if (others.length > 0) {
    const count = `${others.length} other open task${others.length === 1 ? '' : 's'}`;
    console.log(`\n${count} on ${page}: read them before you start, they may be one change.`);
    for (const m of others) {
      const title = m.text
        .split(/\n---\n/)[0]
        .split('\n')[0]
        .slice(0, 100);
      console.log(`  #${m.id} ${m.task?.state ?? ''}, ${m.labels['deictic.at'] ?? '?'}: ${title}`);
    }
  }
}
