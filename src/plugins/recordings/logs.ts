/**
 * What the page logs while it's recorded, and what it throws: for the recording, as custom events.
 *
 * The console has to be wrapped to be heard, and a wrapped console names the wrapper, not the caller, as
 * where each line came from in the browser's own tools. So it's wrapped only while a recording is going,
 * and put back as it ends. Errors nothing caught, and rejections nothing handled, are events of the
 * window's: heard with no wrapping.
 */

const LEVELS = ['debug', 'log', 'info', 'warn', 'error'] as const;

/** A line of the console, or an error nothing caught, as a recording keeps it. */
export interface Logged {
  level: (typeof LEVELS)[number];
  /** What was logged, its arguments each as text, a space between. */
  text: string;
  /** Where from, for an error: its stack, or the place the browser names. */
  stack?: string;
}

/** What one argument is kept of at most, and a whole line, in characters: a logged store is not the recording. */
const ARGUMENT = 1000;
const LINE = 4000;
/** How many lines a page's stretch of a recording keeps: a log in a loop would be all there is of it. */
const MOST = 1000;

const cut = (text: string, most: number) => (text.length > most ? `${text.slice(0, most)}…` : text);

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof Element !== 'undefined' && value instanceof Element)
    return `<${value.localName}${[...value.classList].map((c) => `.${c}`).join('')}>`;
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
  if (typeof value !== 'object' || value === null) return String(value);
  try {
    // What JSON has no word for (a cycle, a BigInt) is said as the console's own summary would.
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/** A console call as a line: its arguments as text, and the stack of the first error among them. */
export function lineOf(level: Logged['level'], args: readonly unknown[]): Logged {
  const stack = args.find((a): a is Error => a instanceof Error)?.stack;
  const text = cut(args.map((a) => cut(textOf(a), ARGUMENT)).join(' '), LINE);
  return { level, text, ...(stack === undefined ? {} : { stack: cut(stack, LINE) }) };
}

/**
 * Hears the console and the window's errors until what it answers is called, which puts the console back
 * as it was. The console's own output is unchanged: each call goes on to what was there.
 */
export function watchLogs(heard: (log: Logged) => void): () => void {
  let on = true;
  let count = 0;
  // A line logged by what hears one (rrweb, taking the event) is not heard: it would never end.
  let hearing = false;
  const hear = (log: Logged) => {
    if (!on || hearing || count > MOST) return;
    hearing = true;
    try {
      heard(count++ === MOST ? { level: 'warn', text: `deictic: over ${MOST} lines logged, and no more are kept in this recording` } : log);
    } catch {
      // The page's log is the page's: nothing of ours may break it.
    } finally {
      hearing = false;
    }
  };

  const wrapped = LEVELS.map((level) => {
    const original = console[level];
    const wrapper = function (this: unknown, ...args: unknown[]) {
      hear(lineOf(level, args));
      original.apply(this, args);
    };
    console[level] = wrapper;
    return { level, original, wrapper };
  });
  const onError = (e: ErrorEvent) => {
    const where = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined;
    const stack = e.error instanceof Error ? e.error.stack : where;
    // Chrome's message says "Uncaught" itself; Firefox's and Safari's don't.
    const text = e.message.startsWith('Uncaught') ? e.message : `Uncaught ${e.message}`;
    hear({ level: 'error', text: cut(text, LINE), ...(stack === undefined ? {} : { stack: cut(stack, LINE) }) });
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const line = lineOf('error', [e.reason]);
    hear({ ...line, text: `Unhandled rejection: ${line.text}` });
  };
  globalThis.addEventListener('error', onError);
  globalThis.addEventListener('unhandledrejection', onRejection);

  return () => {
    on = false;
    globalThis.removeEventListener('error', onError);
    globalThis.removeEventListener('unhandledrejection', onRejection);
    // One something else wrapped since stays, as putting ours back would take theirs off: it's deaf now, and passes on.
    for (const { level, original, wrapper } of wrapped) if (console[level] === wrapper) console[level] = original;
  };
}
