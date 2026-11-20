import type { ReactNode } from 'react';

// Where the site is served from: `/` in dev, the Pages path (`BASE`) in a build.
const base = import.meta.env.BASE_URL;

/** The header and footer every page shares. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <a href={base} className="flex items-center gap-2.5 font-mono font-semibold tracking-tight">
          <img src={`${base}icon.svg`} width="24" height="24" alt="" />
          deictic
        </a>
        <nav className="flex gap-5 font-mono text-sm text-muted">
          <a href={`${base}example/`} className="hover:text-fg">
            playground
          </a>
          <a href="https://github.com/gkurt/deictic" className="hover:text-fg" target="_blank" rel="noreferrer">
            github
          </a>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6">{children}</main>
      <footer className="mx-auto max-w-5xl px-6 py-10 font-mono text-xs text-muted">
        MIT ·{' '}
        <a href="https://x.com/gkurttech" className="hover:text-fg" target="_blank" rel="noreferrer">
          @gkurttech
        </a>
      </footer>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-xs text-fg">{children}</kbd>;
}
