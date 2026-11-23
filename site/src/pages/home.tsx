import { type MouseEvent, type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import code, { type Line } from 'virtual:code';

import { cn } from '#src/cn.ts';

import { Kbd, Shell } from '#src/shell.tsx';

const base = import.meta.env.BASE_URL;

// The demo's file (its text is `code.source`, from `site/code.ts`), and where each of its tags opens in it: what the
// transform writes to `data-deictic`.
const FILE = 'src/Plan.tsx';
const TAGS = ['h3', 'p', 'button', 'article'] as const;
type Tag = (typeof TAGS)[number];
const AT: Record<Tag, { line: number; column: number }> = {
  article: { line: 3, column: 5 },
  h3: { line: 4, column: 7 },
  p: { line: 5, column: 7 },
  button: { line: 6, column: 7 },
};
// A closing tag's line points at its element too.
const LINES: Record<number, Tag> = { 3: 'article', 4: 'h3', 5: 'p', 6: 'button', 7: 'article' };

const plugins = [
  ['tasks', 'task → Vercel Board'],
  ['screenshots', 'element PNG, masked'],
  ['annotations', 'box, arrow, pen, note'],
  ['recordings', 'rrweb replay'],
  ['voice', 'mic clips'],
  ['tailwind', 'class edits → file'],
];

const COMMAND = 'npx deictic init';

function Copy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    // Both labels in one cell, one hidden: the button is as wide as "copied" all along, so nothing beside it moves.
    <button type="button" className="grid shrink-0 cursor-pointer font-mono text-xs text-muted hover:text-fg" onClick={() => void copy()}>
      <span className={`col-start-1 row-start-1 text-right ${copied ? 'invisible' : ''}`}>copy</span>
      <span className={`col-start-1 row-start-1 text-right ${copied ? '' : 'invisible'}`}>copied</span>
    </button>
  );
}

/** How far off its element the light's ring is, in pixels, as the overlay's. */
const CLEAR = 8;
/** The ring's corner on each: the element's own, that much further out. */
const CORNER: Record<Tag, number> = { article: 14, h3: 8, p: 8, button: 12 };
/** A glow in the signal's colour, and around it the dark that dims the rest: far wider than the card's side, which cuts it. */
const LIGHT = [
  '0 0 0 4px color-mix(in srgb, var(--color-signal) 14%, transparent)',
  '0 0 32px color-mix(in srgb, var(--color-signal) 50%, transparent)',
  '0 0 0 100vmax rgb(9 9 11 / 0.45)',
].join(', ');

/** Where the ring is in the card's side, in pixels from its top left. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The overlay's light, in small: the card's side dims around the element, which stays lit in a ring with its
 * caption, and the light glides to the next. Gone while `shown` isn't, where deictic's own is on the page.
 */
function Light({ tag, box, shown }: { tag: Tag; box: Box; shown: boolean }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10 border-[1.5px] border-signal motion-safe:transition-[left,top,width,height,border-radius,opacity] motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.3,0.7,0.2,1)]',
        !shown && 'opacity-0',
      )}
      style={{ ...box, borderRadius: CORNER[tag], boxShadow: LIGHT }}
    >
      <span className="absolute bottom-[calc(100%+6px)] -left-px flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/90 py-0.5 pr-2.5 pl-0.5 font-mono text-[11px] leading-5 font-normal tracking-normal whitespace-nowrap text-zinc-100 shadow-lg backdrop-blur">
        <span className="rounded-full bg-signal px-2 font-semibold text-on-signal">{`<${tag}>`}</span>
        {FILE}:{AT[tag].line}
      </span>
    </div>
  );
}

/**
 * deictic runs on this page too, on the dev server and deployed (`standalone`, in `vite.config.ts`): a click in the
 * demo card opens its popup on what was clicked, as Alt-click would.
 */
function openDeictic(e: MouseEvent<HTMLElement>) {
  if (!(e.target instanceof Element)) return;
  const marked = e.target.closest('[data-deictic]');
  if (marked !== null) void import('deictic/client').then(({ openPopup }) => openPopup(marked));
}

/**
 * A rendered element beside its source: pointing at either lights the other. Left alone, it steps through them.
 * While deictic's popup is open it holds still, whatever the pointer passes over: what's lit is what the popup is
 * on, and a class tried on it there isn't rendered away.
 */
function Demo() {
  const [pointed, setPointed] = useState<Tag | null>(null);
  const [step, setStep] = useState(2);
  const [held, setHeld] = useState(false);
  // `deictic:open` and `deictic:close`: strings, not deictic's constants, which would bring the overlay into a build.
  useEffect(() => {
    const hold = () => setHeld(true);
    const release = () => setHeld(false);
    window.addEventListener('deictic:open', hold);
    window.addEventListener('deictic:close', release);
    return () => {
      window.removeEventListener('deictic:open', hold);
      window.removeEventListener('deictic:close', release);
    };
  }, []);
  // A timer is the browser's: it steps while nothing is pointed at, and not at all where motion is reduced.
  useEffect(() => {
    if (held || pointed !== null || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = setInterval(() => setStep((s) => s + 1), 1800);
    return () => clearInterval(timer);
  }, [pointed, held]);
  const active = pointed ?? TAGS[step % TAGS.length]!;
  const { line, column } = AT[active];
  const light = (tag: Tag | null) => {
    if (!held) setPointed(tag);
  };
  const side = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  // Where an element is laid out is the browser's to say: the light is measured over it as it moves to another, as
  // the window resizes, and as deictic's popup closes, which may have changed the element under it.
  useLayoutEffect(() => {
    const measure = () => {
      const within = side.current;
      // The card has one of each tag.
      const el = within?.querySelector(active);
      if (within === null || el === null || el === undefined) return;
      const from = within.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setBox({ left: r.left - from.left - CLEAR, top: r.top - from.top - CLEAR, width: r.width + 2 * CLEAR, height: r.height + 2 * CLEAR });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, held]);

  // The innermost element under the pointer, not each of its ancestors in turn.
  const point = (tag: Tag) => (e: PointerEvent) => {
    e.stopPropagation();
    light(tag);
  };

  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-surface font-mono text-sm" onPointerLeave={() => light(null)}>
      <div className="grid sm:grid-cols-2">
        <div
          ref={side}
          className="relative flex items-center justify-center overflow-hidden border-b border-line px-6 py-14 sm:border-r sm:border-b-0"
        >
          <article
            className="w-52 cursor-pointer rounded-md border border-line p-6 font-sans"
            onClick={openDeictic}
            onPointerOver={point('article')}
          >
            <h3 className="text-lg font-semibold" onPointerOver={point('h3')}>
              Pro
            </h3>
            <p className="mt-6 text-sm text-muted" onPointerOver={point('p')}>
              $12 / month
            </p>
            <button type="button" className="mt-7 w-full rounded bg-fg px-3 py-1.5 text-sm text-bg" onPointerOver={point('button')}>
              Upgrade
            </button>
          </article>
          {/* None while deictic's own popup is open on one: it lights the element itself, with nothing of the demo's on it. */}
          {box !== null && <Light tag={active} box={box} shown={!held} />}
        </div>
        <pre className="overflow-x-auto py-4 leading-6">
          {code.source.map((tokens, i) => {
            const tag = LINES[i + 1];
            return (
              <div
                // The lines of one file never reorder.
                // oxlint-disable-next-line react/no-array-index-key
                key={i}
                className={cn('border-l-2 border-transparent px-4', tag === active && i + 1 === line && 'border-signal bg-signal/10')}
                onPointerEnter={() => light(tag ?? null)}
              >
                <span className="mr-4 text-muted select-none">{i + 1}</span>
                <Tokens line={tokens} />
              </div>
            );
          })}
        </pre>
      </div>
      <figcaption className="border-t border-line px-4 py-2.5 text-xs text-muted">
        {`<${active} data-deictic="`}
        <span className="text-signal-text tabular-nums">
          {FILE}:{line}:{column}
        </span>
        {'">'}
      </figcaption>
    </figure>
  );
}

/** A line of code in its colours, each a variable `site.css` sets. */
function Tokens({ line }: { line: Line }) {
  return line.map((token, i) => (
    // The tokens of one line never reorder.
    // oxlint-disable-next-line react/no-array-index-key
    <span key={i} style={{ color: token.color }}>
      {token.text}
    </span>
  ));
}

/** What `init` does, each beside its own: it's the whole setup. */
const INIT = [
  'installs deictic and what its plugins use, with your package manager',
  'adds it to your Vite, Next.js, Astro, webpack, Rspack or Bun setup',
  'offers the skill your agent works the tasks with',
];

function Setup() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface font-mono text-sm">
      <div className="flex items-center gap-4 border-b border-line px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate">
          <span className="text-muted">$ </span>
          {COMMAND}
        </span>
        <Copy text={COMMAND} />
      </div>
      <ul className="space-y-1 p-4 text-xs text-muted">
        {INIT.map((line) => (
          <li key={line}>
            <span className="text-signal-text">→ </span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Home() {
  return (
    <Shell>
      <section className="relative py-16 sm:py-24">
        <div className="grid-paper pointer-events-none absolute inset-x-0 top-0 h-96" />
        <div className="relative">
          <h1 className="text-5xl font-bold tracking-tighter sm:text-7xl">
            Element <span className="text-signal-text">→</span> task.
          </h1>
          <p className="mt-6 max-w-md text-muted">
            <Kbd>Alt</Kbd>-click anything in your dev server and say what should change. The task knows its file and line, and goes to your
            agent with a screenshot, a recording or a voice note.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3 font-mono text-sm">
            <span className="flex items-center gap-4 rounded-md border border-line bg-surface px-3 py-2">
              {COMMAND}
              <Copy text={COMMAND} />
            </span>
            <a href={`${base}example/`} className="rounded-md bg-signal px-4 py-2 font-medium text-on-signal hover:brightness-110">
              playground →
            </a>
          </div>
          <div className="mt-14">
            <Demo />
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted">
            <li>dev server only</li>
            <li>0 bytes in a build</li>
            <li>same-origin</li>
            <li>undo · redo</li>
          </ul>
        </div>
      </section>

      <section className="grid gap-x-10 gap-y-6 pb-20 sm:grid-cols-[10rem_1fr]">
        <h2 className="font-mono text-sm text-muted">plugins</h2>
        <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line font-mono text-sm sm:grid-cols-2 lg:grid-cols-3">
          {plugins.map(([name, what]) => (
            <li key={name} className="bg-surface px-4 py-3">
              <span className="text-muted">deictic/</span>
              {name}
              <p className="mt-0.5 text-xs text-muted">{what}</p>
            </li>
          ))}
        </ul>

        <h2 className="font-mono text-sm text-muted">setup</h2>
        <Setup />
      </section>
    </Shell>
  );
}
