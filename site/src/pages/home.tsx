import { type MouseEvent, type PointerEvent, type ReactNode, useEffect, useState } from 'react';

import { cn } from '#src/cn.ts';

import { Kbd, Shell } from '#src/shell.tsx';

const base = import.meta.env.BASE_URL;

// The demo's file, and where each of its tags opens in it: what the transform writes to `data-deictic`.
const FILE = 'src/Plan.tsx';
const SOURCE = [
  'export function Plan() {',
  '  return (',
  '    <article>',
  '      <h3>Pro</h3>',
  '      <p>$12 / month</p>',
  '      <button>Upgrade</button>',
  '    </article>',
  '  );',
  '}',
];
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

const PEERS = 'npm i -D deictic @vercel/board rrweb rrweb-player rrweb-snapshot playwright-core';

const setups = [
  [
    'Vite',
    `// vite.config.ts
import { recommended } from 'deictic/recommended';
import { deictic } from 'deictic/vite';

export default defineConfig({
  plugins: [react(), deictic({ plugins: recommended() })],
});`,
  ],
  [
    'Next.js',
    `// next.config.ts
import { withDeictic } from 'deictic/next';
import { recommended } from 'deictic/recommended';

export default withDeictic(nextConfig, { plugins: recommended() });`,
  ],
  [
    'webpack · Rspack',
    `// webpack.config.ts, rspack.config.ts
import { recommended } from 'deictic/recommended';
import { DeicticPlugin } from 'deictic/webpack';

export default {
  mode: 'development',
  plugins: [new DeicticPlugin({ plugins: recommended() })],
};`,
  ],
  [
    'Bun',
    `// deictic.plugin.ts
import { deictic } from 'deictic/bun';
import { recommended } from 'deictic/recommended';
export default deictic({ plugins: recommended() });

// server.ts
import tools from './deictic.plugin.ts';
Bun.serve({ routes: { ...tools.routes, '/*': index }, development: true });

# bunfig.toml
[serve.static]
plugins = ["./deictic.plugin.ts"]`,
  ],
  [
    'Astro',
    `// astro.config.ts
import { deictic } from 'deictic/astro';
import { recommended } from 'deictic/recommended';

export default defineConfig({
  integrations: [deictic({ plugins: recommended() })],
});`,
  ],
] as const;

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

/** The outline's label, as the overlay draws it. */
function Label({ tag }: { tag: Tag }) {
  return (
    <span className="pointer-events-none absolute bottom-full -left-0.5 bg-signal px-1.5 font-mono text-[11px] leading-5 font-normal tracking-normal whitespace-nowrap text-on-signal">
      {FILE}:{AT[tag].line}:{AT[tag].column}
    </span>
  );
}

const OUTLINED = 'outline-2 outline-signal bg-signal/10';

/**
 * On the dev server deictic runs on this page too: a click in the demo card opens its popup on what was clicked, as
 * Alt-click would. A build has no deictic, and no import of it either.
 */
function openDeictic(e: MouseEvent<HTMLElement>) {
  if (!import.meta.env.DEV || !(e.target instanceof Element)) return;
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

  // The innermost element under the pointer, not each of its ancestors in turn.
  const point = (tag: Tag) => (e: PointerEvent) => {
    e.stopPropagation();
    light(tag);
  };
  const mark = (tag: Tag) => (active === tag ? <Label tag={tag} /> : null);

  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-surface font-mono text-sm" onPointerLeave={() => light(null)}>
      <div className="grid sm:grid-cols-2">
        <div className="flex items-center justify-center border-b border-line px-6 py-12 sm:border-r sm:border-b-0">
          <article
            className={cn('relative w-52 cursor-pointer rounded-md border border-line p-6 font-sans', active === 'article' && OUTLINED)}
            onClick={openDeictic}
            onPointerOver={point('article')}
          >
            {mark('article')}
            <h3 className={cn('relative text-lg font-semibold', active === 'h3' && OUTLINED)} onPointerOver={point('h3')}>
              {mark('h3')}
              Pro
            </h3>
            <p className={cn('relative mt-6 text-sm text-muted', active === 'p' && OUTLINED)} onPointerOver={point('p')}>
              {mark('p')}
              $12 / month
            </p>
            <button
              type="button"
              className={cn(
                'relative mt-7 w-full rounded bg-fg px-3 py-1.5 text-sm text-bg',
                active === 'button' && 'outline-2 outline-signal',
              )}
              onPointerOver={point('button')}
            >
              {mark('button')}
              Upgrade
            </button>
          </article>
        </div>
        <pre className="overflow-x-auto py-4 leading-6">
          {SOURCE.map((text, i) => {
            const tag = LINES[i + 1];
            return (
              <div
                key={text}
                className={cn('border-l-2 border-transparent px-4', tag === active && i + 1 === line && 'border-signal bg-signal/10')}
                onPointerEnter={() => light(tag ?? null)}
              >
                <span className="mr-4 text-muted select-none">{i + 1}</span>
                {paint(text)}
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

/** A source line with its tags in the signal colour. */
function paint(text: string): ReactNode {
  return text.split(/(<\/?[a-z0-9]+>)/).map((part, i) =>
    part.startsWith('<') ? (
      // The parts of one line never reorder.
      // oxlint-disable-next-line react/no-array-index-key
      <span key={i} className="text-signal-text">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function Setup() {
  const [chosen, setChosen] = useState(0);
  const code = setups[chosen]![1];
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface font-mono text-sm">
      <div className="flex items-center gap-4 border-b border-line px-4 py-2.5 text-xs">
        <span className="min-w-0 flex-1 truncate">{PEERS}</span>
        <Copy text={PEERS} />
      </div>
      <div role="tablist" className="flex overflow-x-auto overflow-y-hidden border-b border-line text-xs">
        {setups.map(([name], i) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={i === chosen}
            className={cn(
              'cursor-pointer border-b-2 px-4 py-2.5 whitespace-nowrap',
              i === chosen ? 'border-signal text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
            onClick={() => setChosen(i)}
          >
            {name}
          </button>
        ))}
      </div>
      <pre role="tabpanel" className="overflow-x-auto p-4 leading-6">
        {code.split('\n').map((text, i) => (
          // The lines of one snippet never reorder.
          // oxlint-disable-next-line react/no-array-index-key
          <div key={i} className={cn(/^(\/\/|#) /.test(text) && 'text-muted')}>
            {text || ' '}
          </div>
        ))}
      </pre>
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
            Element <span className="text-signal-text">→</span> source.
          </h1>
          <p className="mt-6 max-w-md text-muted">
            <Kbd>Alt</Kbd>-click anything in your dev server. File a task on it, or edit its classes in the file.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3 font-mono text-sm">
            <span className="flex items-center gap-4 rounded-md border border-line bg-surface px-3 py-2">
              npm i -D deictic
              <Copy text="npm i -D deictic" />
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
