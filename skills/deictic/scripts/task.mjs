#!/usr/bin/env node
// A task, briefly: what was asked, where (and whether that place has moved in the source since), the page,
// what's attached with the command to look at each, and the replies. Usage: task.mjs <id> [--out dir]
// --out downloads the attachments there.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deicticDirs, fail, parseArgs, vb } from './lib.mjs';

const { options, rest } = parseArgs(process.argv.slice(2));
if (rest[0] === undefined) fail('Name a task: task.mjs 68');
const { message: root, replies } = vb(['read', rest[0].replace(/^#/, '')], { json: true });
const [asked = '', where = ''] = root.text.split(/\n---\n/);
const at = root.labels['deictic.at'];
const here = dirname(fileURLToPath(import.meta.url));

console.log(`#${root.id} ${root.task?.state ?? 'not a task'}, by ${root.author?.handle ?? root.by.actor}, ${root.createdAt}`);
console.log(`\nAsked:\n${asked.trim()}\n`);
console.log(where.split('\nIn the source:')[0].trim());
// The part inside the element that was pointed at, where nothing marked it: what the person means.
const pointed = where.match(/\nPointed at, inside it: `([^`]*)`\n`{3,}\w*\n([\s\S]*?)\n`{3,}/);
if (pointed) console.log(`\nPointed at, inside it: ${pointed[1]}\n  ${pointed[2]}`);

// The place as the task saw it, against the file now: the element's opening tag may have moved or changed.
const then = where.match(/In the source:\n`{3,}\w*\n([\s\S]*?)\n`{3,}/)?.[1];
if (at !== undefined) {
  const [file, line] = [at.replace(/:\d+:\d+$/, ''), Number(at.split(':').at(-2))];
  // Marks are from the dev server's root: here, above, or a folder with a .deictic/ of its own.
  const roots = [process.cwd(), ...deicticDirs().map(dirname)];
  const path = roots.map((r) => resolve(r, file)).find((p) => existsSync(p));
  if (path === undefined) {
    console.log(`\n${file} isn't under ${roots.join(' or ')}: find the dev server's root.`);
  } else {
    const lines = readFileSync(path, 'utf8').split('\n');
    const first = then?.split('\n')[0]?.trim();
    const now = lines[line - 1]?.trim();
    if (first === undefined || now?.startsWith(first.slice(0, 40))) {
      console.log(`\nSource: ${path}:${line}, as the task saw it.`);
    } else {
      const moved = lines.findIndex((l) => l.trim().startsWith(first.slice(0, 40)));
      console.log(
        moved >= 0
          ? `\nSource: moved to ${path}:${moved + 1} (the task says line ${line}).`
          : `\nSource: ${path}:${line} no longer reads as the task saw it; it was:\n  ${first}`,
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
  } else {
    console.log(`  ${a.name} (${a.type}, ${kb})${saved || `: vb download ${a.id} <dir>`}`);
  }
}
if (replies.length > 0) console.log('\nReplies:');
for (const r of replies) console.log(`  ${r.author?.handle ?? r.by.actor}: ${r.text}`);
