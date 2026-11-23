/**
 * `deictic recording`: a recording as a timeline: the page, each click and field typed in (with the element's place
 * in the source), scrolls, resizes, each change to the marks (what was drawn, where, and the notes' text), the voice
 * clips, the page's console and its requests where the project records them, and the end. Or the part of it asked
 * for: `--only`, `--problems`, `--from`, `--to`, `--around`, `--grep`, and `--full` for all of each line.
 */
import { relative } from 'node:path';

import type { Shape } from '#src/plugins/annotations/index.ts';

import { clock, fail, ME } from './board.ts';
import { loadRecording } from './find.ts';

/** A node of rrweb's snapshot. */
interface SnapNode {
  id: number;
  type: number;
  tagName?: string;
  textContent?: string;
  attributes?: Record<string, string>;
  childNodes?: SnapNode[];
}

interface Known extends Omit<SnapNode, 'childNodes'> {
  parent: number | undefined;
  kids: number[];
}

/** A request rrweb's network plugin kept. */
interface Request {
  name: string;
  method?: string;
  initiatorType?: string;
  status?: number;
  duration?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
}

/** What rrweb's events carry that the timeline reads: each kind has some of it. */
interface Data {
  href?: string;
  width?: number;
  height?: number;
  node?: SnapNode;
  tag?: string;
  plugin?: string;
  payload?: {
    annotations?: Annotation[];
    svg?: string;
    href?: string;
    level?: string;
    payload?: string[];
    trace?: string[];
    requests?: Request[];
    isInitial?: boolean;
  };
  source?: number;
  type?: number;
  id?: number;
  x?: number;
  y?: number;
  adds?: { node: SnapNode; parentId: number }[];
  attributes?: { id: number; attributes: Record<string, string> }[];
  texts?: { id: number; value: string }[];
  isChecked?: boolean;
  text?: string;
}

interface Event {
  type: number;
  timestamp: number;
  data: Data;
}

interface Annotation {
  id?: string;
  shape: Shape;
}

interface Line {
  t: number;
  at: string;
  kind: string;
  text: string;
  problem?: boolean;
  trace?: string[];
  request?: Request;
  before?: string;
  marks?: Shape[];
  node?: number;
}

type Point = { x: number; y: number };

const round = Math.round;

/** The marks, as data where the recording has it. */
function shapeOf({ shape }: Annotation): string {
  const bounds = (points: Point[]) => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return `(${round(Math.min(...xs))},${round(Math.min(...ys))})–(${round(Math.max(...xs))},${round(Math.max(...ys))})`;
  };
  if (shape.kind === 'box') return `box ${bounds([shape, { x: shape.x + shape.width, y: shape.y + shape.height }])}`;
  if (shape.kind === 'arrow')
    return `arrow from (${round(shape.from.x)},${round(shape.from.y)}) to (${round(shape.to.x)},${round(shape.to.y)})`;
  if (shape.kind === 'pen') return `pen stroke over ${bounds(shape.points)}`;
  return `note at (${round(shape.at.x)},${round(shape.at.y)}): ${JSON.stringify(shape.text)}`;
}

const pairs = (s: string): Point[] => [...s.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

/** The marks read off the SVG, for a recording older than the marks as data. */
function shapesInSvg(svg: string): Annotation[] {
  const out: Annotation[] = [];
  const unescape = (t: string) => t.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  for (const [, tag, attrs = '', inner = ''] of svg.matchAll(/<(rect|path|polyline|text)\b([^>]*)>(?:(.*?)<\/text>)?/g)) {
    const num = (name: string) => Number(new RegExp(`\\b${name}="(-?[\\d.]+)"`).exec(attrs)?.[1]);
    if (tag === 'rect' && attrs.includes('fill="none"'))
      out.push({ shape: { kind: 'box', x: num('x'), y: num('y'), width: num('width'), height: num('height') } });
    if (tag === 'path') {
      const [from, to] = pairs(/d="([^"]*)"/.exec(attrs)?.[1] ?? '');
      if (from !== undefined && to !== undefined) out.push({ shape: { kind: 'arrow', from, to } });
    }
    if (tag === 'polyline') out.push({ shape: { kind: 'pen', points: pairs(/points="([^"]*)"/.exec(attrs)?.[1] ?? '') } });
    if (tag === 'text') {
      const lines = [...inner.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((l) => unescape(l[1] ?? ''));
      const xy = /x="(-?[\d.]+)" y="(-?[\d.]+)"/.exec(inner);
      out.push({ shape: { kind: 'note', at: { x: Number(xy?.[1] ?? 0), y: Number(xy?.[2] ?? 0) }, text: lines.join('\n') } });
    }
  }
  return out;
}

/** The page's nodes by rrweb's IDs, from the full snapshot and each mutation: enough to name an element. */
class Nodes {
  #nodes = new Map<number, Known>();

  clear(): void {
    this.#nodes.clear();
  }

  add(node: SnapNode, parent: number | undefined): void {
    const { childNodes = [], ...rest } = node;
    this.#nodes.set(node.id, { ...rest, parent, kids: childNodes.map((c) => c.id) });
    for (const c of childNodes) this.add(c, node.id);
  }

  get(id: number): Known | undefined {
    return this.#nodes.get(id);
  }

  text(id: number, max = 60): string {
    let out = '';
    const walk = (n: number) => {
      const node = this.#nodes.get(n);
      if (node === undefined || out.length > max) return;
      if (node.type === 3) out += node.textContent ?? '';
      for (const k of node.kids) walk(k);
    };
    walk(id);
    const text = out.replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  /** `<button> "Save" at src/App.tsx:9:7`: the element, its text, and the nearest place deictic marked. */
  describe(id: number | undefined): string {
    const node = id === undefined ? undefined : this.#nodes.get(id);
    if (id === undefined || node === undefined) return `node ${id}`;
    if (node.type === 0) return 'the page';
    let at: string | undefined;
    for (
      let n: Known | undefined = node;
      n !== undefined && at === undefined;
      n = n.parent === undefined ? undefined : this.#nodes.get(n.parent)
    )
      at = n.attributes?.['data-deictic'];
    const tag = node.tagName === undefined ? 'text' : `<${node.tagName}>`;
    const text = this.text(id);
    return `${tag}${text ? ` "${text}"` : ''}${at === undefined ? '' : ` at ${at}`}`;
  }
}

/** The page's console's arguments, each as JSON: a string without its quotes. */
const plain = (arg: string) => {
  try {
    const value: unknown = JSON.parse(arg);
    return typeof value === 'string' ? value : arg;
  } catch {
    return arg;
  }
};

/** Every line of the recording, in time. */
function timelineOf(events: Event[], voice: { id: string; at: number; duration: number }[]): Line[] {
  const t0 = events[0]!.timestamp;
  const timeline: Line[] = [];
  const nodes = new Nodes();
  const push = (t: number, kind: string, text: string, extra: Partial<Line> = {}) =>
    timeline.push({ t, at: clock(t), kind, text, ...extra });
  let marks: Annotation[] = [];
  let scroll: { t: number; id: number | undefined; x: number; y: number } | undefined;
  let typing: { t: number; id: number | undefined; value: string } | undefined;
  const flushScroll = () => {
    if (scroll) push(scroll.t, 'scroll', `${nodes.describe(scroll.id)} to (${scroll.x},${scroll.y})`);
    scroll = undefined;
  };
  const flushTyping = () => {
    if (typing) push(typing.t, 'input', `${nodes.describe(typing.id)}: ${typing.value}`);
    typing = undefined;
  };

  for (const e of events) {
    const t = e.timestamp - t0;
    const d = e.data;
    const payload = d.payload ?? {};
    if (e.type === 4) push(t, 'page', `${d.href} at ${d.width}×${d.height}`);
    if (e.type === 2 && d.node !== undefined) {
      nodes.clear();
      nodes.add(d.node, undefined);
    }
    if (e.type === 5 && d.tag === 'deictic.annotations') {
      const now = payload.annotations ?? shapesInSvg(payload.svg ?? '');
      const key = (a: Annotation) => a.id ?? JSON.stringify(a.shape);
      const before = new Set(marks.map(key));
      const after = new Set(now.map(key));
      const added = now.filter((a) => !before.has(key(a)));
      const removed = marks.filter((a) => !after.has(key(a)));
      if (added.length > 0 || removed.length > 0) {
        // All of them cleared (a task added, the page left) is said as that: each was said as it was drawn.
        const gone = now.length === 0 && removed.length > 1 ? [`− all ${removed.length} marks`] : removed.map((a) => `− ${shapeOf(a)}`);
        const text = [...added.map((a) => `+ ${shapeOf(a)}`), ...gone].join('; ');
        push(t, 'marks', text, { marks: now.map((a) => a.shape) });
      }
      marks = now;
    }
    // The address changed with no load: a route of the app's.
    if (e.type === 5 && d.tag === 'deictic.page') push(t, 'page', `${payload.href} (a route change, no load)`);
    // The page's console, and errors nothing caught (rrweb's console plugin), and where it was logged from, which goes
    // under a warning or an error.
    if (e.type === 6 && d.plugin === 'rrweb/console@1') {
      const level = payload.level ?? 'log';
      push(t, `console.${level}`, (payload.payload ?? []).map(plain).join(' '), {
        trace: payload.trace ?? [],
        ...(['error', 'assert', 'warn'].includes(level) ? { problem: true } : {}),
      });
    }
    // The page's requests (rrweb's network plugin), masked as they were kept: each as it ended. One the browser
    // reported of itself has no method; headers and bodies, where kept, are in `--json`.
    if (e.type === 6 && d.plugin === 'rrweb/network@1') {
      for (const r of payload.requests ?? []) {
        const took = r.duration !== undefined && Number.isFinite(r.duration) ? ` in ${round(r.duration)} ms` : '';
        const status = r.status === undefined || r.status === 0 ? 'no status (failed, blocked, or another origin’s)' : r.status;
        push(t, 'request', `${r.method ?? r.initiatorType ?? ''} ${r.name} → ${status}${took}`.trim(), {
          request: r,
          ...((r.status ?? 0) >= 400 ? { problem: true } : {}),
          ...(payload.isInitial === true ? { before: 'made as the page loaded, before this moment' } : {}),
        });
      }
    }
    if (e.type === 5 && d.tag === 'deictic.end') push(t, 'end', 'recording stopped');
    if (e.type !== 3) continue;
    if (d.source === 0) {
      for (const a of d.adds ?? []) nodes.add(a.node, a.parentId);
      for (const a of d.attributes ?? []) {
        const node = nodes.get(a.id);
        if (node) node.attributes = { ...node.attributes, ...a.attributes };
      }
      for (const x of d.texts ?? []) {
        const node = nodes.get(x.id);
        if (node) node.textContent = x.value;
      }
    }
    if (d.source === 2 && (d.type === 2 || d.type === 3 || d.type === 4)) {
      flushScroll();
      flushTyping();
      const what = { 2: 'click', 3: 'right-click', 4: 'double-click' }[d.type];
      // A click a key made (Enter on a button) has no position.
      const where = d.x === 0 && d.y === 0 ? ' by keyboard' : ` at (${round(d.x ?? 0)},${round(d.y ?? 0)}) in the viewport`;
      push(t, what, `${nodes.describe(d.id)}${where}`, { node: d.id });
    }
    if (d.source === 3) {
      if (scroll && scroll.id !== d.id) flushScroll();
      scroll = { t: scroll?.t ?? t, id: d.id, x: round(d.x ?? 0), y: round(d.y ?? 0) };
    }
    if (d.source === 4) push(t, 'resize', `viewport ${d.width}×${d.height}`);
    if (d.source === 5) {
      if (typing && typing.id !== d.id) flushTyping();
      const value = d.isChecked !== undefined && d.text === undefined ? String(d.isChecked) : JSON.stringify(d.text);
      typing = { t: typing?.t ?? t, id: d.id, value };
    }
  }
  flushScroll();
  flushTyping();
  for (const c of voice) push(c.at, 'voice', `clip ${c.id}, ${clock(c.duration)} long, until ${clock(c.at + c.duration)}`);
  return timeline.sort((a, b) => a.t - b.t);
}

/**
 * The page's own URLs as paths, in a line of text: `http://localhost:5180/src/App.tsx?t=1712:9:7` is `/src/App.tsx:9:7`,
 * and a file Vite serves from outside its root (`/@fs/S:/…/dist/client.js`) is that file's path from here. The header
 * says the origin once; `--json` keeps every URL whole.
 */
function shortener(page: string): (text: string) => string {
  let origin: string;
  try {
    origin = new URL(page).origin;
  } catch {
    return (text) => text;
  }
  const quoted = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A Windows path has a drive's colon in it, which a line and column also follow.
  const fs = new RegExp(`${quoted}/@fs/([A-Za-z]:)?([^\\s?:)]+)`, 'g');
  const own = new RegExp(`${quoted}(?=/)`, 'g');
  return (text) =>
    text
      .replace(fs, (_, drive: string | undefined, rest: string) =>
        relative(process.cwd(), drive ? `${drive}${rest}` : `/${rest}`).replaceAll('\\', '/'),
      )
      .replace(own, '')
      // A bundler's cache-busting query, between a module's path and its line.
      .replace(/(\.[cm]?[jt]sx?)\?[tv]=[\w.-]+/g, '$1');
}

export interface Options {
  nth: string;
  json?: boolean;
  only?: string[];
  problems?: boolean;
  from?: string;
  to?: string;
  around?: string;
  grep?: string;
  full?: boolean;
}

export async function run(named: string, values: Options): Promise<void> {
  const { kept, id, replay, task } = await loadRecording(named, Number(values.nth));
  const events = kept.events as Event[];
  if (!Array.isArray(events) || events.length === 0) fail(`Recording ${id} has no events.`);
  const timeline = timelineOf(events, kept.voice ?? []);

  // The part asked for. Seconds, as the replay's `?t=` and `frame --at` take them.
  const seconds = (name: 'from' | 'to' | 'around') => {
    const given = values[name];
    if (given === undefined) return undefined;
    const value = Number(given);
    if (!Number.isFinite(value)) fail(`--${name} takes seconds from the recording's start, as 12 or 4.5: not ${given}`);
    return value * 1000;
  };
  const around = seconds('around');
  const from = seconds('from') ?? (around === undefined ? undefined : around - 3000);
  const to = seconds('to') ?? (around === undefined ? undefined : around + 3000);
  const only = (values.only ?? []).flatMap((list) => list.split(',')).filter(Boolean);
  const grep = values.grep?.toLowerCase();
  // `console` is every level's lines, `click` a right or a double one too.
  const isKind = (kind: string, asked: string) => kind === asked || kind.startsWith(`${asked}.`) || kind.endsWith(`-${asked}`);
  const shown = timeline.filter(
    (e) =>
      (only.length === 0 || only.some((asked) => isKind(e.kind, asked))) &&
      (values.problems !== true || e.problem === true) &&
      (from === undefined || e.t >= from) &&
      (to === undefined || e.t <= to) &&
      (grep === undefined || `${e.kind} ${e.text}`.toLowerCase().includes(grep)),
  );

  const colorScheme = kept.colorScheme ?? 'light';
  const startedAt = new Date(kept.startedAt ?? events[0]!.timestamp).toISOString();
  if (values.json) {
    const head = { id, page: kept.page, viewport: kept.viewport, colorScheme, startedAt, duration: kept.duration, replay, task: task?.id };
    console.log(JSON.stringify({ ...head, lines: timeline.length, timeline: shown }, null, 2));
    return;
  }
  console.log(`Recording ${id}${task ? ` on task #${task.id}` : ''}: ${clock(kept.duration)} of ${kept.page}`);
  console.log(`viewport ${kept.viewport.width}×${kept.viewport.height}, ${colorScheme}, started ${startedAt}`);
  if (replay !== undefined) console.log(`replays at ${replay} (add ?t=<seconds> to open it paused there)`);
  if (shown.length < timeline.length) console.log(`${shown.length} of its ${timeline.length} lines, as asked`);
  console.log();
  const short = shortener(kept.page);
  const under = (line: string) => console.log(`${' '.repeat(22)}${short(line)}`);
  for (const e of shown) {
    console.log(`${e.at.padStart(6)}  ${e.kind.padEnd(13)} ${short(e.text)}`);
    // Where a warning or an error came from, its nearest few places: all of them, and every line's, with `--full`.
    if (e.trace && (values.full === true || e.problem === true))
      for (const line of values.full ? e.trace : e.trace.slice(0, 5)) under(`at ${line}`);
    if (values.full !== true || e.request === undefined) continue;
    const r = e.request;
    if (e.before !== undefined) under(e.before);
    for (const [title, held] of [
      ['request headers', r.requestHeaders],
      ['response headers', r.responseHeaders],
    ] as const)
      for (const [name, value] of Object.entries(held ?? {})) under(`${title}  ${name}: ${value}`);
    if (r.requestBody !== undefined) under(`request body  ${r.requestBody}`);
    if (r.responseBody !== undefined) under(`response body  ${r.responseBody}`);
  }
  if (shown.length === 0) console.log(timeline.length === 0 ? 'Nothing in it.' : 'No line of it is what was asked for.');
  // Where something went wrong, how to get to it: what led up to it, and what the page looked like.
  const problems = timeline.filter((e) => e.problem === true).length;
  if (problems === 0 || shown.length < timeline.length) return;
  const ref = task?.id ?? id;
  console.log(
    `\n${problems} problem${problems === 1 ? '' : 's'}: --problems lists them, --around <seconds> shows what led to one, and ${ME} frame ${ref} --at <seconds> the page then.`,
  );
}
