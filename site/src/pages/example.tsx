import type { TaskAdded } from 'deictic/tasks';
import { useEffect, useState } from 'react';

import { cn } from '#src/cn.ts';

import { Kbd, Shell } from '#src/shell.tsx';

const plans = [
  { name: 'Hobby', price: 0, perks: ['1 project', 'Community support'] },
  { name: 'Pro', price: 12, perks: ['Unlimited projects', 'Email support', 'Custom domains'] },
  { name: 'Team', price: 40, perks: ['Everything in Pro', 'Roles', 'Audit log'] },
];

const stats = [
  { label: 'Deploys today', value: '128' },
  { label: 'Median build', value: '41s' },
  { label: 'Error rate', value: '0.3%' },
];

const activity = [
  { what: 'Deployed main to production', when: '2m ago' },
  { what: 'Preview ready for fix-header', when: '18m ago' },
  { what: 'Build cache cleared', when: '1h ago' },
];

function Plan({ name, price, perks, chosen, onChoose }: (typeof plans)[number] & { chosen: boolean; onChoose: () => void }) {
  return (
    <li
      className={cn(
        'flex flex-col rounded-xl border border-zinc-200 p-5 dark:border-zinc-800',
        chosen && 'border-signal ring-2 ring-signal/25',
      )}
    >
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="text-sm text-zinc-500">${price} / month</p>
      <ul className="mt-3 flex-1 space-y-1 text-sm">
        {perks.map((perk) => (
          <li key={perk}>✓ {perk}</li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-4 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-zinc-900"
        onClick={onChoose}
      >
        {chosen ? 'Chosen' : 'Choose'}
      </button>
    </li>
  );
}

function Guide() {
  return (
    <aside className="rounded-xl border border-signal/30 bg-signal/10 p-5 text-sm">
      <h2 className="font-semibold">Try it on this page</h2>
      <p className="mt-3">
        <Kbd>Alt</Kbd> + click to add a task, with annotations, recordings and voice notes.
      </p>
    </aside>
  );
}

/** A page in miniature, standing in for the task's screenshot: the board would show the real one. */
function Shot({ marked }: { marked: boolean }) {
  return (
    <svg viewBox="0 0 160 100" className="w-full rounded-md border border-line bg-surface" aria-hidden="true">
      <rect x="10" y="10" width="60" height="8" rx="2" className="fill-zinc-300 dark:fill-zinc-700" />
      <rect x="10" y="26" width="110" height="5" rx="2" className="fill-zinc-200 dark:fill-zinc-800" />
      {[10, 60, 110].map((x) => (
        <rect
          key={x}
          x={x}
          y="42"
          width="42"
          height="48"
          rx="3"
          className="fill-zinc-100 stroke-zinc-300 dark:fill-zinc-900 dark:stroke-zinc-700"
        />
      ))}
      <rect x="58" y="40" width="46" height="52" rx="4" fill="none" strokeWidth="2" className="stroke-signal" />
      {marked && <ellipse cx="81" cy="66" rx="34" ry="32" fill="none" stroke="#ef4444" strokeWidth="2" />}
    </svg>
  );
}

/** Tasks added on this page, newest first, as a board shows them. The Task tab tells of each on `window`. */
function Board() {
  const [tasks, setTasks] = useState<TaskAdded[]>([]);
  useEffect(function hearTasks() {
    // `deictic:task`: a string, not deictic's constant, which would bring the Task tab's code into a build.
    const heard = (e: Event) => setTasks((all) => [(e as CustomEvent<TaskAdded>).detail, ...all]);
    window.addEventListener('deictic:task', heard);
    return () => window.removeEventListener('deictic:task', heard);
  }, []);
  return (
    <section className="text-sm">
      <h2 className="flex items-baseline justify-between font-mono text-xs text-muted">
        <span>board · {tasks[0]?.channel ?? 'deictic'}</span>
        <span>{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-line p-4 text-muted">Tasks you add show here.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {tasks.map((task) => (
            <li key={task.id} className="space-y-2 rounded-xl border border-line bg-surface p-3">
              {task.attached.screenshots > 0 && <Shot marked={task.attached.marks > 0} />}
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{task.title}</p>
                <span className="shrink-0 rounded-full bg-signal/15 px-2 py-0.5 font-mono text-[11px] text-signal-text">{task.state}</span>
              </div>
              <p className="truncate font-mono text-xs text-muted">
                #{task.id} · {task.target.loc.file}:{task.target.loc.line} · &lt;{task.target.tag}&gt;
              </p>
              {(task.attached.recordings > 0 || task.attached.voice > 0 || task.attached.marks > 0) && (
                <p className="flex flex-wrap gap-1.5 font-mono text-[11px] text-muted">
                  {task.attached.recordings > 0 && <span className="rounded border border-line px-1.5">▶ recording</span>}
                  {task.attached.voice > 0 && <span className="rounded border border-line px-1.5">voice note</span>}
                  {task.attached.marks > 0 && (
                    <span className="rounded border border-line px-1.5">
                      {task.attached.marks} mark{task.attached.marks === 1 ? '' : 's'}
                    </span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Example() {
  const [chosen, setChosen] = useState('Pro');
  return (
    <Shell>
      <div className="grid gap-8 py-10 lg:grid-cols-[1fr_320px]">
        <div className="relative space-y-10 rounded-2xl border-2 border-dashed border-zinc-300 p-6 dark:border-zinc-700">
          <p className="absolute -top-3 left-4 bg-bg px-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Sample UI to try deictic on · not a real product
          </p>
          <section>
            <h1 className="text-3xl font-bold">Pick a plan</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">Every plan comes with a 14-day trial. Switch or cancel any time.</p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
              {plans.map((p) => (
                <Plan key={p.name} {...p} chosen={chosen === p.name} onChoose={() => setChosen(p.name)} />
              ))}
            </ul>
          </section>

          <section className="grid grid-cols-3 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-zinc-100 p-4 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500 uppercase">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold">{s.value}</p>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <ul className="mt-3 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {activity.map((a) => (
                <li key={a.what} className="flex justify-between py-2">
                  <span>{a.what}</span>
                  <span className="text-zinc-500">{a.when}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex items-center justify-between rounded-xl bg-zinc-100 p-4 text-sm dark:bg-zinc-900">
            <span>
              Signed in as <span className="rr-mask font-medium">Ada Lovelace</span>
            </span>
            <span className="rr-block rounded-md bg-amber-100 px-3 py-1 text-amber-900">Private note</span>
          </section>
        </div>
        <div className="space-y-6 self-start">
          <Guide />
          <Board />
        </div>
      </div>
    </Shell>
  );
}
