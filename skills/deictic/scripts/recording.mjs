#!/usr/bin/env node
// A recording as a timeline: the page, each click and field typed in (with the element's place in the source),
// scrolls, resizes, each change to the marks (what was drawn, where, and the notes' text), the voice clips,
// the page's console and its requests where the project records them, and the end.
// Usage: recording.mjs <task | replay URL | recording ID | file> [--nth 2] [--json]
// And to ask for a part of it, in any mix:
//   --only console,request   these kinds of line (`console` is every level; also page, click, input, scroll, resize, marks, voice)
//   --problems               errors, warnings and requests that failed
//   --from 10 --to 15        a stretch, in seconds; --around 12 is the 3 seconds either side
//   --grep text              lines with this in them, in any case
//   --full                   all of each line: where it was logged from, a request's headers and bodies
import { clock, fail, loadRecording, parseArgs } from './lib.mjs';

const { options, rest } = parseArgs(process.argv.slice(2), ['json', 'problems', 'full']);
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
  // The address changed with no load: a route of the app's.
  if (e.type === 5 && e.data.tag === 'deictic.page') push(t, 'page', `${e.data.payload.href} (a route change, no load)`);
  // The page's console, and errors nothing caught (rrweb's console plugin): each argument as JSON, a string in
  // quotes, and where it was logged from, which goes under a warning or an error.
  if (e.type === 6 && e.data.plugin === 'rrweb/console@1') {
    const { level, payload, trace } = e.data.payload;
    const plain = (arg) => {
      try {
        const value = JSON.parse(arg);
        return typeof value === 'string' ? value : arg;
      } catch {
        return arg;
      }
    };
    push(t, `console.${level}`, (payload ?? []).map(plain).join(' '), {
      trace: trace ?? [],
      ...(['error', 'assert', 'warn'].includes(level) ? { problem: true } : {}),
    });
  }
  // The page's requests (rrweb's network plugin), masked as they were kept: each as it ended. One the browser
  // reported of itself has no method; headers and bodies, where kept, are in `--json`.
  if (e.type === 6 && e.data.plugin === 'rrweb/network@1') {
    for (const r of e.data.payload.requests ?? []) {
      const took = Number.isFinite(r.duration) ? ` in ${Math.round(r.duration)} ms` : '';
      const status = r.status ? r.status : 'no status (failed, blocked, or another origin’s)';
      push(t, 'request', `${r.method ?? r.initiatorType ?? ''} ${r.name} → ${status}${took}`.trim(), {
        request: r,
        ...(r.status >= 400 ? { problem: true } : {}),
        ...(e.data.payload.isInitial ? { before: 'made as the page loaded, before this moment' } : {}),
      });
    }
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

// The part asked for. Seconds, as the replay's `?t=` and `frame.mjs --at` take them.
const seconds = (name) => {
  const given = options[name]?.[0];
  if (given === undefined) return undefined;
  const value = Number(given);
  if (!Number.isFinite(value)) fail(`--${name} takes seconds from the recording's start, as 12 or 4.5: not ${given}`);
  return value * 1000;
};
const around = seconds('around');
const from = seconds('from') ?? (around === undefined ? undefined : around - 3000);
const to = seconds('to') ?? (around === undefined ? undefined : around + 3000);
const only = (options.only ?? []).flatMap((list) => String(list).split(',')).filter(Boolean);
const grep = options.grep?.[0]?.toLowerCase();
// `console` is every level's lines, `click` a right or a double one too.
const isKind = (kind, asked) => kind === asked || kind.startsWith(`${asked}.`) || kind.endsWith(`-${asked}`);
const shown = timeline.filter(
  (e) =>
    (only.length === 0 || only.some((asked) => isKind(e.kind, asked))) &&
    (!options.problems || e.problem === true) &&
    (from === undefined || e.t >= from) &&
    (to === undefined || e.t <= to) &&
    (grep === undefined || `${e.kind} ${e.text}`.toLowerCase().includes(grep)),
);

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
  console.log(JSON.stringify({ ...head, lines: timeline.length, timeline: shown }, null, 2));
} else {
  console.log(`Recording ${id}${task ? ` on task #${task.id}` : ''}: ${clock(kept.duration)} of ${kept.page}`);
  console.log(`viewport ${kept.viewport.width}×${kept.viewport.height}, ${head.colorScheme}, started ${head.startedAt}`);
  if (replay) console.log(`replays at ${replay} (add ?t=<seconds> to open it paused there)`);
  if (shown.length < timeline.length) console.log(`${shown.length} of its ${timeline.length} lines, as asked`);
  console.log();
  const under = (line) => console.log(`${' '.repeat(22)}${line}`);
  for (const e of shown) {
    console.log(`${e.at.padStart(6)}  ${e.kind.padEnd(13)} ${e.text}`);
    // Where a warning or an error came from, its nearest few places: all of them, and every line's, with `--full`.
    if (e.trace && (options.full || e.problem)) for (const line of options.full ? e.trace : e.trace.slice(0, 5)) under(`at ${line}`);
    if (!options.full || !e.request) continue;
    const r = e.request;
    if (e.before) under(e.before);
    for (const [title, held] of [
      ['request headers', r.requestHeaders],
      ['response headers', r.responseHeaders],
    ])
      for (const [name, value] of Object.entries(held ?? {})) under(`${title}  ${name}: ${value}`);
    if (r.requestBody) under(`request body  ${r.requestBody}`);
    if (r.responseBody) under(`response body  ${r.responseBody}`);
  }
  if (shown.length === 0) console.log(timeline.length === 0 ? 'Nothing in it.' : 'No line of it is what was asked for.');
}
