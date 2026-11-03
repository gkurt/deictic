import { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">deictic on Bun</h1>
      <p className="text-gray-600">Hold Alt and point at anything here, then Alt-click it.</p>
      <button type="button" className="rounded-md border px-3 py-1.5" onClick={() => setCount(count + 1)}>
        Clicked {count} times
      </button>
    </main>
  );
}
