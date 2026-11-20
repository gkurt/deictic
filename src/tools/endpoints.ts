/**
 * The dev server's half of deictic, under `/__deictic/`: `read` and `apply` an op through a
 * plugin, `undo`, `redo` and `history`, and `open`, which opens a place in the editor. Written over
 * `Request` and `Response`, so each integration mounts them its own way (Vite as middleware), and
 * served from the page's own origin, so no token travels to the page. `undo`, `redo` and `history` are a
 * plugin's on an element where the request names them (as the popup does: its tab, its element), and
 * the whole history's where it doesn't.
 *
 * Everything but `open` and `history` writes or may, so only the page itself may send it: a POST of
 * JSON from the same origin, which a form or a script on another site can't send without asking first.
 *
 * Each plugin's own `routes` are under `plugins/<name>/`. A `GET` there reaches the plugin as it
 * comes; anything else only from the page's own origin, in whatever type it sends (an image, say).
 * Nothing is answered before every plugin's `setup` has run.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import { type Loc, Refusal, type ServerPlugin, type Target } from '#src/index.ts';

import { History, type Scope } from './history.ts';
import { setUp } from './plugins.ts';
import { applyEdits, resolveFile, sourceAt } from './source.ts';

export interface EndpointOptions {
  root: string;
  plugins: ServerPlugin[];
  /** The path the endpoints sit under, ending in `/`: `/` by default. */
  base?: string;
  /** Opens a place in the editor: a redirect to the dev server's own launcher. */
  open: (path: string, loc: Loc) => Response | Promise<Response>;
  history?: History;
}

interface Body {
  plugin: string;
  target: Target;
  op?: unknown;
}

const scopeOf = (plugin: string, { file, line, column }: Loc): Scope => ({ plugin, target: `${file}:${line}:${column}` });
/** The scope an undo or a redo names, or none for the whole history. */
const scopeIn = ({ plugin, target }: Partial<Body>) =>
  plugin === undefined || target === undefined ? undefined : scopeOf(plugin, target.loc);

/** Answers deictic's requests, and nothing for any other path. */
export function endpoints({ root, plugins, base = '/', open, history = new History(root, { plugins }) }: EndpointOptions) {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const prefix = `${base}__deictic/`;
  // Started now, awaited by every request: a plugin's API is there before anything asks for it.
  const ready = setUp(root, plugins);

  const pluginOf = (name: string) => {
    const plugin = byName.get(name);
    if (plugin === undefined) throw new Refusal(`no plugin "${name}" on the server: is it in the bundler plugin's \`plugins\`?`);
    return plugin;
  };

  const routes: Record<string, (body: Body) => Promise<unknown>> = {
    read: async ({ plugin, target }) => ({ model: await readOf(pluginOf(plugin), target) }),
    apply: async ({ plugin: name, target, op }) => {
      const plugin = pluginOf(name);
      if (plugin.apply === undefined) throw new Refusal(`${name} changes nothing from its panel: it has no \`apply\``);
      const source = sourceAt(root, target);
      const before = await readOf(plugin, target);
      const { file, line } = target.loc;
      const label = `${name} ${file}:${line}: ${plugin.describe?.(op, before) ?? 'edit'}`;
      const result = await plugin.apply(source, target, op);
      const scope = scopeOf(name, target.loc);
      const change = Array.isArray(result)
        ? history.commit(label, applyEdits(source, result), scope)
        : history.record(label, name, result.done, scope);
      return { model: await readOf(plugin, target), change };
    },
    undo: async (body) => ({ change: await history.undo(scopeIn(body)) }),
    redo: async (body) => ({ change: await history.redo(scopeIn(body)) }),
  };
  // A plugin without `read` has no model, and no need for its element to be where the page says.
  const readOf = (plugin: ServerPlugin, target: Target) => (plugin.read === undefined ? null : plugin.read(sourceAt(root, target), target));
  // One write at a time: a plugin's change may wait on the network, and an undo sent meanwhile must
  // take back that change, not the one before it.
  let queue: Promise<unknown> = Promise.resolve();
  const serially = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  };

  return async (req: Request): Promise<Response | undefined> => {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(prefix)) return undefined;
    const route = url.pathname.slice(prefix.length);
    const origin = req.headers.get('origin');
    const sameOrigin = origin !== null && new URL(origin).host === url.host;
    try {
      const context = await ready;
      if (route.startsWith('plugins/')) {
        const [name = '', first = ''] = route.slice('plugins/'.length).split('/');
        const handle = byName.get(name)?.routes?.[first];
        if (handle === undefined) return new Response(`no endpoint ${url.pathname}`, { status: 404 });
        if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin)
          return Response.json({ problem: `only the page itself may ${req.method} to ${name}` }, { status: 403 });
        return await handle(req, context);
      }
      const loc = {
        file: url.searchParams.get('file') ?? '',
        line: Number(url.searchParams.get('line')),
        column: Number(url.searchParams.get('column')),
      };
      if (route === 'history') {
        const plugin = url.searchParams.get('plugin');
        return Response.json(history.list(plugin === null ? undefined : scopeOf(plugin, loc)));
      }
      if (route === 'open') return await open(resolveFile(root, loc.file), loc);
      const handler = routes[route];
      if (handler === undefined) return new Response(`no endpoint ${url.pathname}`, { status: 404 });
      if (req.method !== 'POST' || !sameOrigin || req.headers.get('content-type')?.startsWith('application/json') !== true)
        return Response.json({ problem: 'edits come from the page, as JSON' }, { status: 403 });
      const body = (await req.json()) as Body;
      return Response.json(await (route === 'read' ? handler(body) : serially(() => handler(body))));
    } catch (e) {
      if (e instanceof Refusal) return Response.json({ problem: e.message }, { status: 422 });
      return Response.json({ problem: e instanceof Error ? (e.stack ?? e.message) : String(e) }, { status: 500 });
    }
  };
}

/** A redirect within the page's origin, to a launcher the dev server answers itself. */
export const redirect = (path: string) => new Response(null, { status: 307, headers: { Location: path } });

/**
 * The endpoints as Node middleware, for Vite's server. The request's host is the one the page was
 * served from: a proxy's `x-forwarded-host` before its own.
 */
export function nodeMiddleware(
  handle: (req: Request) => Promise<Response | undefined>,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, res, next) => {
    // Before reading the body, which a request for anything else leaves to whoever answers it.
    if (req.url?.includes('/__deictic/') !== true) return next();
    const forwarded = req.headers['x-forwarded-host'];
    const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? req.headers.host ?? 'localhost';
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers))
      for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, v);

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks);
      handle(new Request(`http://${host}${req.url}`, { method: req.method, headers, body }))
        .then(async (response) => {
          if (response === undefined) return next();
          res.statusCode = response.status;
          response.headers.forEach((value, name) => res.setHeader(name, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        })
        .catch((e: unknown) => {
          res.statusCode = 500;
          res.end(e instanceof Error ? e.message : String(e));
        });
    });
  };
}
