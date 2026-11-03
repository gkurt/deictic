import type { ReactNode } from 'react';

// Where the site is served from: `/` in dev, the Pages path (`BASE`) in a build.
const base = import.meta.env.BASE_URL;

/** The header and footer every page shares. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <a href={base} className="flex items-center gap-2 font-semibold">
          <img src={`${base}icon.svg`} width="24" height="24" alt="" />
          deictic
        </a>
        <nav className="flex gap-5 text-sm text-zinc-600 dark:text-zinc-400">
          <a href={base} className="hover:text-zinc-900 dark:hover:text-white">
            Home
          </a>
          <a href={`${base}example/`} className="hover:text-zinc-900 dark:hover:text-white">
            Playground
          </a>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6">{children}</main>
      <footer className="mx-auto max-w-5xl px-6 py-10 text-sm text-zinc-500">
        MIT · Runs in dev only · By{' '}
        <a href="https://x.com/gkurttech" className="hover:text-zinc-900 dark:hover:text-white" target="_blank" rel="noreferrer">
          @gkurttech
        </a>
      </footer>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
      {children}
    </kbd>
  );
}
