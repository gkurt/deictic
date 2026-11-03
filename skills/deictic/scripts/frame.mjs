#!/usr/bin/env node
// Screenshots of a recording at moments of it, as its replay page shows them (marks and pointer included),
// at the recorded viewport's size. By default: just after each change to the marks, and the end.
// Usage: frame.mjs <task | replay URL | recording ID | file> [--at 4.2 ...] [--every 2] [--out dir] [--base url]
// Needs the dev server running (it serves the replay) and Playwright (playwright-core or playwright) in the project.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { clock, fail, fromProject, loadRecording, parseArgs } from './lib.mjs';

const { options, rest } = parseArgs(process.argv.slice(2));
const { kept, id, replay } = await loadRecording(rest[0], Number(options.nth?.[0] ?? 1));
const base = options.base?.[0];
// The replay is served by the dev server that recorded it, under deictic's routes.
const page = base
  ? `${base.replace(/\/$/, '')}/__deictic/plugins/recordings/replay/${id}`
  : (replay ?? `${new URL(kept.page).origin}/__deictic/plugins/recordings/replay/${id}`);

const t0 = kept.events[0].timestamp;
let times = (options.at ?? []).map(Number);
if (options.every) for (let t = 0; t <= kept.duration / 1000; t += Number(options.every[0])) times.push(t);
if (times.length === 0) {
  // Just after each change to the marks, so it's drawn, then the end.
  const marks = kept.events.filter((e) => e.type === 5 && e.data.tag === 'deictic.annotations' && (e.data.payload.svg ?? '') !== '');
  times = [...marks.map((e) => (e.timestamp - t0 + 50) / 1000), kept.duration / 1000];
}
times = [...new Set(times.map((t) => Math.min(Math.max(0, t), kept.duration / 1000)))].sort((a, b) => a - b);
if (times.some((t) => !Number.isFinite(t))) fail('--at and --every take seconds: --at 4.2');

const out = resolve(options.out?.[0] ?? join(tmpdir(), 'deictic-frames', id));
mkdirSync(out, { recursive: true });

const { chromium } = await fromProject('playwright-core', 'playwright');
let browser;
for (const channel of [undefined, 'chrome', 'msedge']) {
  try {
    browser = await chromium.launch(channel ? { channel } : {});
    break;
  } catch {}
}
if (browser === undefined) fail('No Chromium to launch: npx playwright install chromium, or install Chrome or Edge.');
try {
  // `bare`: the replay alone, at the recorded size, so a window that size shows it 1:1.
  const view = await browser.newPage({ viewport: kept.viewport });
  for (const t of times) {
    const url = new URL(page);
    url.searchParams.set('t', t.toFixed(2));
    url.searchParams.set('bare', '');
    const res = await view.goto(url.href);
    if (!res?.ok()) fail(`${url.href}: ${res?.status()}. Is the dev server running? Pass --base with its URL.`);
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
