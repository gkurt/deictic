/**
 * `deictic frame`: screenshots of a recording at moments of it, as its replay page shows them (marks and pointer
 * included), at the recorded viewport's size. By default: just after each change to the marks, and the end. Needs
 * the dev server running (it serves the replay) and Playwright in the project.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { Browser, chromium } from 'playwright-core';

import { clock, fail, parseArgs } from './board.ts';
import { fromProject, loadRecording } from './find.ts';

export const usage =
  'frame <task | replay URL | recording ID | file> [--at 4.2 ...] [--every 2] [--out dir] [--base url]   PNGs of a recording';

interface Marks {
  type: number;
  timestamp: number;
  data: { tag?: string; payload?: { svg?: string } };
}

export async function run(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs(args, {
    nth: { type: 'string', default: '1' },
    at: { type: 'string', multiple: true },
    every: { type: 'string' },
    out: { type: 'string' },
    base: { type: 'string' },
  });
  const { kept, id, replay } = await loadRecording(positionals[0], Number(values.nth));
  // The replay is served by the dev server that recorded it, under deictic's routes.
  const page =
    values.base === undefined
      ? (replay ?? `${new URL(kept.page).origin}/__deictic/plugins/recordings/replay/${id}`)
      : `${values.base.replace(/\/$/, '')}/__deictic/plugins/recordings/replay/${id}`;

  const events = kept.events as Marks[];
  const t0 = events[0]?.timestamp ?? 0;
  const end = kept.duration / 1000;
  let times = (values.at ?? []).map(Number);
  if (values.every !== undefined) for (let t = 0; t <= end; t += Number(values.every)) times.push(t);
  if (times.length === 0) {
    // Just after each change to the marks, so it's drawn, then the end.
    const marks = events.filter((e) => e.type === 5 && e.data.tag === 'deictic.annotations' && (e.data.payload?.svg ?? '') !== '');
    times = [...marks.map((e) => (e.timestamp - t0 + 50) / 1000), end];
  }
  times = [...new Set(times.map((t) => Math.min(Math.max(0, t), end)))].sort((a, b) => a - b);
  if (times.some((t) => !Number.isFinite(t))) fail('--at and --every take seconds: --at 4.2');

  const out = resolve(values.out ?? join(tmpdir(), 'deictic-frames', id));
  mkdirSync(out, { recursive: true });

  const playwright = await fromProject<{ chromium: typeof chromium }>('playwright-core', 'playwright');
  let browser: Browser | undefined;
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      browser = await playwright.chromium.launch(channel === undefined ? {} : { channel });
      break;
    } catch {
      // Not this one: the next.
    }
  }
  if (browser === undefined) fail('No Chromium to launch: npx playwright install chromium, or install Chrome or Edge.');
  try {
    // `bare`: the replay alone, at the recorded size, so a window that size shows it 1:1.
    const view = await browser.newPage({ viewport: kept.viewport });
    for (const t of times) {
      const url = new URL(page);
      url.searchParams.set('t', t.toFixed(2));
      url.searchParams.set('bare', '');
      const res = await view.goto(url.href).catch((e: unknown) => (e instanceof Error ? e.message.split('\n')[0] : String(e)));
      if (typeof res === 'string' || !res?.ok()) {
        const why = typeof res === 'string' ? res : String(res?.status());
        await browser.close();
        fail(`${url.href}: ${why}. Is the dev server running? Start it, or pass --base with its URL.`);
      }
      await view.waitForSelector('body[data-ready]', { timeout: 15_000 });
      // The replayed page's images and fonts.
      await view.waitForLoadState('networkidle').catch(() => {});
      await view.waitForTimeout(200);
      const path = join(out, `${String(Math.round(t * 1000)).padStart(6, '0')}.png`);
      await view.screenshot({ path });
      console.log(`${clock(t * 1000).padStart(6)}  ${path}`);
    }
  } finally {
    await browser.close();
  }
}
