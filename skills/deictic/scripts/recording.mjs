#!/usr/bin/env node
// A recording as a timeline: the page, each click and field typed in (with the element's place in the source),
// scrolls, resizes, each change to the marks (what was drawn, where, and the notes' text), the voice clips,
// and the end. Usage: recording.mjs <task | replay URL | recording ID | file> [--nth 2] [--json]
import { clock, fail, loadRecording, parseArgs } from './lib.mjs';

const { options, rest } = parseArgs(process.argv.slice(2), ['json']);
const { kept, id, replay, task } = await loadRecording(rest[0], Number(options.nth?.[0] ?? 1));
const { events } = kept;
if (!Array.isArray(events) || events.length === 0) fail(`Recording ${id} has no events.`);
const t0 = events[0].timestamp;

// The page's nodes by rrweb's IDs, from the full snapshot and each mutation: enough to name an element.
const nodes = new Map();
const add = (node, parent) => {
  nodes.set(node.id, { ...node, parent, childNodes: undefined, kids: (node.childNodes ?? []).map((c) => c.id) });
  for (const c of node.childNodes ?? []) add(c, node.id);
};
const textOf = (nid, max = 60) => {
  let out = '';
  const walk = (n) => {
    const node = nodes.get(n);
    if (node === undefined || out.length > max) return;
    if (node.type === 3) out += node.textContent ?? '';
    for (const k of node.kids ?? []) walk(k);
  };
  walk(nid);
  const text = out.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};
/** `<button> "Save" at src/App.tsx:9:7`: the element, its text, and the nearest place deictic marked. */
const describe = (nid) => {
  const node = nodes.get(nid);
  if (node === undefined) return `node ${nid}`;
  if (node.type === 0) return 'the page';
  let at;
  for (let n = node; n !== undefined && at === undefined; n = nodes.get(n.parent)) at = n.attributes?.['data-deictic'];
  const tag = node.tagName ? `<${node.tagName}>` : 'text';
  const text = textOf(nid);
  return `${tag}${text ? ` "${text}"` : ''}${at ? ` at ${at}` : ''}`;
};

// The marks, as data where the recording has it, else read off the SVG.
const boundsOf = (points) => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return `(${Math.round(Math.min(...xs))},${Math.round(Math.min(...ys))})–(${Math.round(Math.max(...xs))},${Math.round(Math.max(...ys))})`;
};
const shapeOf = ({ shape }) => {
  switch (shape.kind) {
    case 'box':
      return `box ${boundsOf([shape, { x: shape.x + shape.width, y: shape.y + shape.height }])}`;
    case 'arrow':
      return `arrow from (${Math.round(shape.from.x)},${Math.round(shape.from.y)}) to (${Math.round(shape.to.x)},${Math.round(shape.to.y)})`;
    case 'pen':
      return `pen stroke over ${boundsOf(shape.points)}`;
    case 'note':
      return `note at (${Math.round(shape.at.x)},${Math.round(shape.at.y)}): ${JSON.stringify(shape.text)}`;
    default:
      return shape.kind;
  }
};
const pairs = (s) => [...s.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
const shapesInSvg = (svg) => {
  const out = [];
  const unescape = (t) => t.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  for (const m of svg.matchAll(/<(rect|path|polyline|text)\b([^>]*)>(?:(.*?)<\/text>)?/g)) {
    const [, tag, attrs, inner] = m;
    const num = (name) => Number(attrs.match(new RegExp(`\\b${name}="(-?[\\d.]+)"`))?.[1]);
    if (tag === 'rect' && attrs.includes('fill="none"'))
      out.push({ shape: { kind: 'box', x: num('x'), y: num('y'), width: num('width'), height: num('height') } });
    if (tag === 'path') {
      const [from, to] = pairs(attrs.match(/d="([^"]*)"/)[1]);
      out.push({ shape: { kind: 'arrow', from, to } });
    }
    if (tag === 'polyline') out.push({ shape: { kind: 'pen', points: pairs(attrs.match(/points="([^"]*)"/)[1]) } });
    if (tag === 'text') {
      const lines = [...inner.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((l) => unescape(l[1]));
      const at = pairs(
        inner
          .match(/x="(-?[\d.]+)" y="(-?[\d.]+)"/)
          ?.slice(1)
          .join(',') ?? '0,0',
      )[0];
      out.push({ shape: { kind: 'note', at, text: lines.join('\n') } });
    }
  }
  return out;
};

const timeline = [];
const at = (e) => e.timestamp - t0;
const push = (t, kind, text, extra = {}) => timeline.push({ t, at: clock(t), kind, text, ...extra });
let marks = [];
let scroll;
let typing;
const flushScroll = () => {
  if (scroll) push(scroll.t, 'scroll', `${describe(scroll.id)} to (${scroll.x},${scroll.y})`);
  scroll = undefined;
};
const flushTyping = () => {
  if (typing) push(typing.t, 'input', `${describe(typing.id)}: ${typing.value}`);
  typing = undefined;
};

for (const e of events) {
  const t = at(e);
  if (e.type === 4) push(t, 'page', `${e.data.href} at ${e.data.width}×${e.data.height}`);
  if (e.type === 2) {
    nodes.clear();
    add(e.data.node, undefined);
  }
  if (e.type === 5 && e.data.tag === 'deictic.annotations') {
    const now = e.data.payload.annotations ?? shapesInSvg(e.data.payload.svg ?? '');
    const key = (a) => a.id ?? JSON.stringify(a.shape);
    const before = new Set(marks.map(key));
    const after = new Set(now.map(key));
    const added = now.filter((a) => !before.has(key(a)));
    const removed = marks.filter((a) => !after.has(key(a)));
    if (added.length > 0 || removed.length > 0) {
      push(t, 'marks', [...added.map((a) => `+ ${shapeOf(a)}`), ...removed.map((a) => `− ${shapeOf(a)}`)].join('; '), {
        marks: now.map((a) => a.shape),
      });
    }
    marks = now;
  }
  if (e.type === 5 && e.data.tag === 'deictic.end') push(t, 'end', 'recording stopped');
  if (e.type !== 3) continue;
  const d = e.data;
  if (d.source === 0) {
    for (const a of d.adds ?? []) add(a.node, a.parentId);
    for (const a of d.attributes ?? []) {
      const node = nodes.get(a.id);
      if (node) node.attributes = { ...node.attributes, ...a.attributes };
    }
    for (const x of d.texts ?? []) {
      const node = nodes.get(x.id);
      if (node) node.textContent = x.value;
    }
  }
  if (d.source === 2 && [2, 3, 4].includes(d.type)) {
    flushScroll();
    flushTyping();
    const what = { 2: 'click', 3: 'right-click', 4: 'double-click' }[d.type];
    // A click a key made (Enter on a button) has no position.
    const where = d.x === 0 && d.y === 0 ? ' by keyboard' : ` at (${Math.round(d.x)},${Math.round(d.y)}) in the viewport`;
    push(t, what, `${describe(d.id)}${where}`, { node: d.id });
  }
  if (d.source === 3) {
    if (scroll && scroll.id !== d.id) flushScroll();
    scroll = { t: scroll?.t ?? t, id: d.id, x: Math.round(d.x), y: Math.round(d.y) };
  }
  if (d.source === 4) push(t, 'resize', `viewport ${d.width}×${d.height}`);
  if (d.source === 5) {
    if (typing && typing.id !== d.id) flushTyping();
    typing = {
      t: typing?.t ?? t,
      id: d.id,
      value: d.isChecked !== undefined && d.text === undefined ? String(d.isChecked) : JSON.stringify(d.text),
    };
  }
}
flushScroll();
flushTyping();
for (const c of kept.voice ?? []) push(c.at, 'voice', `clip ${c.id}, ${clock(c.duration)} long, until ${clock(c.at + c.duration)}`);
timeline.sort((a, b) => a.t - b.t);

const head = {
  id,
  page: kept.page,
  viewport: kept.viewport,
  colorScheme: kept.colorScheme ?? 'light',
  startedAt: new Date(kept.startedAt ?? t0).toISOString(),
  duration: kept.duration,
  replay,
  task: task?.id,
};
if (options.json) {
  console.log(JSON.stringify({ ...head, timeline }, null, 2));
} else {
  console.log(`Recording ${id}${task ? ` on task #${task.id}` : ''}: ${clock(kept.duration)} of ${kept.page}`);
  console.log(`viewport ${kept.viewport.width}×${kept.viewport.height}, ${head.colorScheme}, started ${head.startedAt}`);
  if (replay) console.log(`replays at ${replay} (add ?t=<seconds> to open it paused there)`);
  console.log();
  for (const e of timeline) console.log(`${e.at.padStart(6)}  ${e.kind.padEnd(12)} ${e.text}`);
}
