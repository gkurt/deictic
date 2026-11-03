'use client';

import { useState } from 'react';

// A client component: code the browser loads, which is what starts deictic's overlay.
export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" className="rounded-md border px-3 py-1.5" onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}
