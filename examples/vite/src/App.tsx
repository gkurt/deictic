import { useState } from 'react';

import { cn } from './cn.ts';

const plans = [
  { name: 'Hobby', price: 0 },
  { name: 'Pro', price: 12 },
  { name: 'Team', price: 40 },
];

function Plan({ name, price, chosen, onChoose }: { name: string; price: number; chosen: boolean; onChoose: () => void }) {
  return (
    <li className={cn('rounded-lg border p-4', chosen && 'border-violet-500 ring-2 ring-violet-200')}>
      <h2 className="text-lg font-semibold">{name}</h2>
      <p className="text-sm text-zinc-500">${price} / month</p>
      <button type="button" className="mt-3 rounded bg-zinc-900 px-3 py-1 text-sm text-white" onClick={onChoose}>
        Choose
      </button>
    </li>
  );
}

export function App() {
  const [chosen, setChosen] = useState('Pro');
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-bold">Pick a plan</h1>
      <p>Hold Alt-Shift and point at anything, then Alt-Shift-click to edit its classes, or Alt-click to add a task.</p>
      <ul className="mt-6 grid grid-cols-3 gap-4">
        {plans.map((p) => (
          <Plan key={p.name} {...p} chosen={chosen === p.name} onChoose={() => setChosen(p.name)} />
        ))}
      </ul>
    </main>
  );
}
