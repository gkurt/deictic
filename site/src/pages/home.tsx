import { Kbd, Shell } from '#src/shell.tsx';

const features = [
  {
    keys: ['Alt'],
    title: 'Add a task',
    body: "Alt-click an element and say what should change. It goes to a Vercel Board with the file, line, tag, page and rendered HTML, for whoever works the board's tasks: you, a teammate, or your own agent.",
  },
  {
    keys: ['Alt'],
    title: 'Edit the classes',
    body: 'Switch to the Tailwind tab and its classes open as chips. Add or remove them, see every element from that line change at once, then Save writes them to the className in your file.',
  },
  {
    keys: ['↶', '↷'],
    title: 'Undo anything',
    body: 'Every change, a file edit or a task, lands in one history. Undo puts a file back while it is still as deictic left it, and cancels a task while no one has claimed it.',
  },
];

const steps = [
  [
    'Element → source',
    'A transform marks each host element with data-deictic="src/App.tsx:12:5" at build time, so it works for server components and points at the tag itself.',
  ],
  [
    'Plugins',
    'A server half reads the element from the parsed file and answers edits, or makes a change of its own. A client half draws the panel.',
  ],
  [
    'Same origin',
    'Changes go to /__deictic/* on the dev server, as same-origin JSON only. No token reaches the page, and none of it is in a build.',
  ],
];

export function Home() {
  return (
    <Shell>
      <section className="py-16 sm:py-24">
        <p className="text-sm font-medium text-violet-600 dark:text-violet-400">Devtools for your running app</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">Point at it. Change what made it.</h1>
        <p className="mt-5 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Hold Alt and point at any element: deictic finds the line that rendered it. Edit it there and the source changes, or leave a task
          for later.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href={`${import.meta.env.BASE_URL}example/`}
            className="rounded-md bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-500"
          >
            Open the playground
          </a>
          <code className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">npm install -D deictic</code>
        </div>
        <p className="mt-6 text-sm text-zinc-500">
          This page runs it too: hold <Kbd>Alt</Kbd> and point at this paragraph.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <article key={f.title} className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <div className="flex gap-1">
              {f.keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </div>
            <h2 className="mt-3 font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{f.body}</p>
          </article>
        ))}
      </section>

      <section className="py-16">
        <h2 className="text-2xl font-bold">Set up</h2>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-zinc-950 p-5 text-sm text-zinc-100">
          {`// vite.config.ts
import { deictic } from 'deictic/vite';
import { tailwind } from 'deictic/tailwind';
import { tasks } from 'deictic/tasks';

export default defineConfig({
  plugins: [react(), tailwindcss(), deictic({ plugins: [tailwind(), tasks()] })],
});`}
        </pre>
        <p className="mt-3 text-sm text-zinc-500">
          It runs in <code>vite dev</code> only. Tasks need <code>@vercel/board</code> and a board: <code>npx vb serve</code> runs one on
          your machine.
        </p>

        <h2 className="mt-14 text-2xl font-bold">How it works</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {steps.map(([title, body], i) => (
            <li key={title} className="text-sm">
              <span className="font-mono text-violet-600 dark:text-violet-400">0{i + 1}</span>
              <h3 className="mt-1 font-semibold">{title}</h3>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </Shell>
  );
}
