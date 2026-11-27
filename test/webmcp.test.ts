/**
 * deictic's WebMCP tools in a real browser: a page with the overlay, its tools registered with a stand-in for Chrome's
 * `document.modelContext` (which only agent-browser's Chrome, or a flag, turns on), and each called as an agent would.
 * Skipped where no Chromium is found.
 */
import { afterAll, expect, test } from 'bun:test';
import { join } from 'node:path';

import type { Browser, Page } from 'playwright-core';

import { browserOf } from '#src/plugins/screenshots/playwright.ts';
import { tasks } from '#src/plugins/tasks/index.ts';
import { clientModule } from '#src/tools/integration.ts';

const browser: Browser | undefined = await browserOf({}).catch(() => undefined);

const built = await Bun.build({ entrypoints: [join(import.meta.dir, 'webmcp.page.ts')], target: 'browser', conditions: ['deictic@dev'] });
if (!built.success) throw new AggregateError(built.logs, 'the WebMCP test page did not build');
const script = await built.outputs[0]!.text();

const html = `<!doctype html><html><body>
  <main data-deictic="src/App.tsx:3:5">
    <h1 data-deictic="src/App.tsx:4:7">Pricing</h1>
    <ul>
      <li data-deictic="src/Plan.tsx:8:9" class="plan">Free</li>
      <li data-deictic="src/Plan.tsx:8:9" class="plan">Pro <b>popular</b></li>
    </ul>
    <button data-deictic="src/App.tsx:12:7" style="margin: 40px; width: 120px; height: 40px">Buy</button>
  </main>
  <script type="module" src="/page.js"></script>
</body></html>`;

const server = Bun.serve({
  port: 0,
  fetch: (req) =>
    new URL(req.url).pathname === '/page.js'
      ? new Response(script, { headers: { 'content-type': 'text/javascript' } })
      : new Response(html, { headers: { 'content-type': 'text/html' } }),
});

afterAll(async () => {
  await browser?.close();
  await server.stop();
});

/** Chrome's `document.modelContext`, standing in: what's registered is kept, by name, to call. */
const FAKE = () => {
  const tools = new Map<string, { annotations: Record<string, boolean>; execute: (input: object) => Promise<unknown> }>();
  Object.defineProperty(document, 'modelContext', {
    value: {
      registerTool: (tool: { name: string; annotations: Record<string, boolean>; execute: (input: object) => Promise<unknown> }) => {
        tools.set(tool.name, tool);
      },
    },
  });
  (globalThis as { tools?: typeof tools }).tools = tools;
};

async function pageWith(query = ''): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 800, height: 600 } });
  await page.addInitScript(FAKE);
  await page.goto(`${server.url.href}${query}`);
  await page.waitForFunction(() => (globalThis as { tools?: Map<string, unknown> }).tools!.size > 0);
  return page;
}

const names = (page: Page) => page.evaluate(() => [...(globalThis as { tools?: Map<string, unknown> }).tools!.keys()].sort());

/** Calls a tool as an agent would: its answer, or what it threw. */
const call = (page: Page, name: string, input: object = {}) =>
  page.evaluate(
    async ([name, input]) => {
      const tool = (globalThis as { tools?: Map<string, { execute: (input: object) => Promise<unknown> }> }).tools!.get(name);
      if (tool === undefined) return { missing: name };
      try {
        return { answer: await tool.execute(input) };
      } catch (e) {
        return { problem: (e as Error).message };
      }
    },
    [name, input] as const,
  );

test('passes the option to the page only where it is set', () => {
  expect(clientModule([tasks()], '/')).not.toContain('webmcp');
  expect(clientModule([tasks()], '/', undefined, { webmcp: true })).toContain(', webmcp: {} });');
  expect(clientModule([tasks()], '/', undefined, { webmcp: { write: true } })).toContain(', webmcp: {"write":true} });');
});

test.skipIf(browser === undefined)(
  'offers the tools that only read or make something of the page, and not those that write, unless asked',
  async () => {
    const page = await pageWith();
    expect(await names(page)).toEqual([
      'annotations_add',
      'annotations_list',
      'annotations_remove',
      'deictic_find',
      'deictic_history',
      'deictic_locate',
      'deictic_pointed',
      'tailwind_classes',
      'tasks_list',
      'tasks_thread',
    ]);
    const hints = await page.evaluate(() => {
      const tools = (globalThis as { tools?: Map<string, { annotations: Record<string, boolean> }> }).tools!;
      return { locate: tools.get('deictic_locate')!.annotations, add: tools.get('annotations_add')!.annotations };
    });
    expect(hints).toEqual({ locate: { readOnlyHint: true }, add: { readOnlyHint: false } });
    const writing = await pageWith('?write');
    expect(await names(writing)).toContain('tailwind_set');
    expect(await names(writing)).toContain('deictic_undo');
    await page.close();
    await writing.close();
  },
);

test.skipIf(browser === undefined)('tells where an element is written, by selector or mark, and finds what a place renders', async () => {
  const page = await pageWith();
  const { answer: pro } = (await call(page, 'deictic_locate', { element: 'li b' })) as { answer: Record<string, unknown> };
  expect(pro).toMatchObject({ place: 'src/Plan.tsx:8:9', tag: 'li', named: '<li>', count: 2, nth: 2, text: 'Pro popular' });
  expect(pro.chain).toEqual(['src/App.tsx:3']);
  expect(await call(page, 'deictic_locate', { element: 'src/Plan.tsx:8:9', nth: 2 })).toMatchObject({ answer: { nth: 2 } });
  expect(await call(page, 'deictic_locate', { element: 'src/Plan.tsx:8:9', nth: 3 })).toEqual({
    problem: "src/Plan.tsx:8:9 renders 2 elements on this page, so there's no number 3",
  });
  expect(await call(page, 'deictic_locate', { element: 'ul' })).toMatchObject({ answer: { place: 'src/App.tsx:3:5' } });
  expect(await call(page, 'deictic_locate', { element: 'nav' })).toEqual({ problem: 'nothing on this page matches nav' });
  const { answer: found } = (await call(page, 'deictic_find', { file: 'Plan.tsx' })) as { answer: { elements: { nth: number }[] } };
  expect(found.elements.map((e) => e.nth)).toEqual([1, 2]);
  // Text an element holds is in those around it too.
  expect(await call(page, 'deictic_find', { file: 'src/App.tsx', text: 'buy' })).toMatchObject({
    answer: { elements: [{ place: 'src/App.tsx:3:5' }, { place: 'src/App.tsx:12:7' }] },
  });
  await page.close();
});

test.skipIf(browser === undefined)('says what the person points at: nothing, then what was lit, then the popup’s element', async () => {
  const page = await pageWith();
  expect(await call(page, 'deictic_pointed')).toEqual({ answer: { pointing: null } });
  await page.keyboard.down('Alt');
  await page.mouse.move(100, 100);
  await page.mouse.move(140, 80);
  await page.waitForTimeout(100);
  const button = await page.evaluate(() => document.querySelector('button')!.getBoundingClientRect().toJSON() as DOMRect);
  await page.mouse.move(button.x + 10, button.y + 10);
  await page.waitForTimeout(100);
  await page.keyboard.up('Alt');
  expect(await call(page, 'deictic_pointed')).toMatchObject({
    answer: { pointing: { element: { place: 'src/App.tsx:12:7' }, popup: false } },
  });
  await page.keyboard.down('Alt');
  await page.mouse.click(button.x + 10, button.y + 10);
  await page.keyboard.up('Alt');
  expect(await call(page, 'deictic_pointed')).toMatchObject({
    answer: { pointing: { element: { place: 'src/App.tsx:12:7' }, popup: true, tab: 'tailwind' } },
  });
  await page.close();
});

test.skipIf(browser === undefined)('draws a mark for the person, lists it with what it is about, and removes it', async () => {
  const page = await pageWith();
  const { answer } = (await call(page, 'annotations_add', { element: 'button', note: 'This one' })) as { answer: { added: string[] } };
  expect(answer.added).toHaveLength(2);
  const { answer: listed } = (await call(page, 'annotations_list')) as { answer: { marks: Record<string, unknown>[] } };
  expect(listed.marks).toMatchObject([
    { kind: 'box', about: { place: 'src/App.tsx:12:7' } },
    { kind: 'note', text: 'This one' },
  ]);
  expect(await call(page, 'annotations_remove', { ids: [answer.added[1]] })).toEqual({ answer: { left: 1 } });
  expect(await call(page, 'annotations_remove')).toEqual({ answer: { left: 0 } });
  await page.close();
});

test.skipIf(browser === undefined)('reads and writes an element’s classes through its plugin, and undoes it', async () => {
  const page = await pageWith('?write');
  expect(await call(page, 'tailwind_classes', { element: 'h1' })).toEqual({ answer: { editable: true, classes: 'p-2 text-sm' } });
  expect(await call(page, 'tailwind_set', { element: 'h1', classes: '  p-4\n text-sm ' })).toEqual({
    answer: { editable: true, classes: 'p-4 text-sm' },
  });
  expect(await call(page, 'deictic_undo', { plugin: 'tailwind', element: 'h1' })).toEqual({ answer: { undid: 'className: p-2 → p-4' } });
  const sent = (await page.evaluate(() => (globalThis as { sent?: { route: string; body: unknown }[] }).sent!)).filter(
    (s) => (s.body as { plugin?: string } | undefined)?.plugin === 'tailwind',
  );
  const target = { loc: { file: 'src/App.tsx', line: 4, column: 7 }, tag: 'h1' };
  expect(sent).toEqual([
    { route: 'read', body: { plugin: 'tailwind', target } },
    { route: 'apply', body: { plugin: 'tailwind', target, op: { classes: 'p-4 text-sm' } } },
    { route: 'undo', body: { plugin: 'tailwind', target } },
  ]);
  await page.close();
});

test.skipIf(browser === undefined)('adds a task about an element as the Task tab does, or about the page', async () => {
  const page = await pageWith('?write');
  expect(await call(page, 'tasks_add', { element: 'src/Plan.tsx:8:9', nth: 2, text: ' Bigger ' })).toEqual({
    answer: { id: '7', state: 'ready', channel: 'deictic' },
  });
  expect(await call(page, 'tasks_add', { text: 'The page is slow', screenshot: false })).toMatchObject({ answer: { id: '7' } });
  expect(await call(page, 'tasks_add', { text: 'x', recordings: ['gone'] })).toEqual({
    problem: "no recording gone is waiting to be attached: recordings_stop answers one's ID",
  });
  const ops = (await page.evaluate(() => (globalThis as { sent?: { route: string; body: unknown }[] }).sent!))
    .filter((s) => s.route === 'apply')
    .map((s) => s.body as { target: { loc: { line: number } }; op: Record<string, unknown> });
  expect(ops[0]!.target.loc.line).toBe(8);
  expect(ops[0]!.op).toMatchObject({
    text: 'Bigger',
    count: 2,
    which: { nth: 2, text: 'Pro popular' },
    chain: ['src/App.tsx:3'],
    html: '<li data-deictic="src/Plan.tsx:8:9" class="plan">Pro <b>popular</b></li>',
    viewport: { width: 800, height: 600 },
  });
  expect(ops[0]!.op.detached).toBeUndefined();
  expect(ops[1]!.op).toMatchObject({ text: 'The page is slow', count: 0, detached: true });
  expect(ops[1]!.op.html).toBeUndefined();
  await page.close();
});
