/**
 * The page `webmcp.test.ts` serves, bundled: the overlay with the annotations and Tailwind page halves, and a server in
 * the page (`Standalone`) that answers their reads and writes (and the tasks plugin's, as a board with none), keeping what it was sent for the test to read.
 */
import { start } from '#src/client/index.ts';
import type { ClientPlugin } from '#src/index.ts';
import annotations from '#src/plugins/annotations/client.ts';
import tailwind from '#src/plugins/tailwind/client.ts';
import tasks from '#src/plugins/tasks/client.ts';

const sent: { route: string; body: unknown }[] = [];
let classes = 'p-2 text-sm';
(globalThis as { sent?: typeof sent }).sent = sent;

const write = location.search.includes('write');
start({
  base: '/',
  shortcut: { modifiers: ['Alt'], button: 'left' },
  // As the client module the bundler writes has them: untyped, each a plugin of its own model and op.
  plugins: [
    { plugin: annotations as unknown as ClientPlugin, options: { color: '#ef4444' } },
    { plugin: tailwind as unknown as ClientPlugin },
    { plugin: tasks as unknown as ClientPlugin },
  ],
  webmcp: { write },
  server: async (request) => {
    const route = new URL(request.url).pathname.replace('/__deictic/', '');
    const body: unknown = request.method === 'POST' ? await request.json() : undefined;
    sent.push({ route, body });
    const plugin = (body as { plugin?: string } | undefined)?.plugin;
    if (route === 'plugins/tasks/page') return Response.json({ channel: 'deictic', tasks: [] });
    if (plugin === 'tasks' && route === 'apply') {
      const task = { id: '7', title: 'Bigger', text: 'Bigger', state: 'ready', open: true };
      return Response.json({ model: { channel: 'deictic', tasks: [task] } });
    }
    if (route === 'apply') classes = (body as { op: { classes: string } }).op.classes;
    if (route === 'read' || route === 'apply') return Response.json({ model: { editable: true, classes } });
    if (route === 'history') return Response.json({ done: [{ label: 'className: p-2 → p-4' }], undone: [] });
    if (route === 'undo') return Response.json({ change: { label: 'className: p-2 → p-4' } });
    return Response.json({ problem: `no ${route} here` }, { status: 404 });
  },
});
