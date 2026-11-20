/**
 * `deictic/tailwind`: open its tab on an element to edit its classes, written to its `className`.
 *
 * Only a list the source spells out can be edited: `className="…"`, `className={'…'}`, a template
 * with no `${}`, or the first argument of a class helper (`cn('…', active && '…')`), whose other
 * arguments stay as they are. A list built any other way is shown, not edited, since there is no one
 * place for a class to go. An element without the attribute gets one.
 *
 * Its routes answer the panel from the project's own Tailwind (`catalog.ts`): what completes a word typed
 * (`complete`), what each class sets (`info`), the classes of a class's kind (`alternatives`) and the CSS of
 * classes the page's build hasn't seen (`css`). Without Tailwind v4 they answer nothing, and the panel is plain.
 */
import type { Expression, JSXAttribute, JSXOpeningElement } from 'oxc-parser';

import { definePlugin, Refusal, type ServerContext, type Shortcut } from '#src/index.ts';

import { type Catalog, loadCatalog } from './catalog.ts';

export type { Alternatives, ClassInfo } from './catalog.ts';

export interface TailwindOptions {
  /** Calls whose first argument is a class list: `cn`, `clsx`, `cx`, `twMerge`, `classNames` by default. */
  helpers?: string[];
  /** The attribute an element without one gets: `className`, or `class` for Solid and Preact. */
  attribute?: 'className' | 'class';
  /**
   * The stylesheet that imports Tailwind and holds the theme, from the project's root: `src/index.css`. What
   * the panel completes and shows comes from it. Tailwind's default theme without one.
   */
  css?: string;
  /** What opens its tab directly, beside deictic's own shortcut, which opens any: none by default. */
  shortcut?: Shortcut;
}

export type Model =
  | {
      editable: true;
      classes: string;
      /** The helper's other arguments, as written, which add classes at runtime: `active && 'ring'`. */
      rest?: string;
    }
  | { editable: false; source: string };

export interface Op {
  classes: string;
}

/** Where a class list sits in the source: the text between its quotes, or where a missing attribute goes. */
type List = { kind: 'list'; start: number; end: number; quote: string; rest?: string };
type Spot = List | { kind: 'missing'; at: number } | { kind: 'fixed'; source: string };

const HELPERS = ['cn', 'clsx', 'cx', 'twMerge', 'classNames'];

export function tailwind(options: TailwindOptions = {}) {
  const helpers = new Set(options.helpers ?? HELPERS);
  const attribute = options.attribute ?? 'className';
  // Loaded on the first ask, as it takes a moment, and once: a project without Tailwind v4 has none.
  let loading: Promise<Catalog | undefined> | undefined;
  const catalog = ({ root }: ServerContext) =>
    (loading ??= loadCatalog(root, options.css).catch((problem: unknown) => {
      console.warn(`deictic/tailwind: no completions or class details, as ${problem instanceof Error ? problem.message : String(problem)}`);
      return undefined;
    }));
  const asked = async (request: Request): Promise<string[]> => {
    const body = (await request.json().catch(() => undefined)) as { classes?: unknown } | undefined;
    return Array.isArray(body?.classes) ? body.classes.filter((c): c is string => typeof c === 'string').slice(0, 500) : [];
  };
  return definePlugin<Model, Op>({
    name: 'tailwind',
    client: 'deictic/tailwind/client',
    shortcut: options.shortcut,
    routes: {
      // `complete?q=fle`: the classes for a word being typed.
      complete: async (request, context) => {
        const query = new URL(request.url).searchParams.get('q') ?? '';
        return Response.json({ items: (await catalog(context))?.complete(query) ?? [] });
      },
      // What each of `classes` sets. `available` is false where there's no catalog, so the panel stops asking.
      info: async (request, context) => {
        const known = await catalog(context);
        return Response.json({ available: known !== undefined, items: known?.info(await asked(request)) ?? [] });
      },
      // `alternatives?class=text-sm`: the classes of its kind, or nothing for one Tailwind doesn't know.
      alternatives: async (request, context) => {
        const name = new URL(request.url).searchParams.get('class') ?? '';
        return Response.json((await catalog(context))?.alternatives(name) ?? null);
      },
      css: async (request, context) => Response.json({ css: (await catalog(context))?.css(await asked(request)) ?? '' }),
    },
    read({ code, element }) {
      const spot = spotOf(element, code, helpers);
      if (spot.kind === 'fixed') return { editable: false, source: spot.source };
      if (spot.kind === 'missing') return { editable: true, classes: '' };
      return { editable: true, classes: code.slice(spot.start, spot.end), ...(spot.rest === undefined ? {} : { rest: spot.rest }) };
    },
    apply({ code, element }, _target, { classes }) {
      const list = classes.trim().split(/\s+/).filter(Boolean).join(' ');
      const spot = spotOf(element, code, helpers);
      if (spot.kind === 'fixed') throw new Refusal('this class list is built at runtime: edit it in the editor');
      if (spot.kind === 'missing')
        return list === '' ? [] : [{ start: spot.at, end: spot.at, text: ` ${attribute}="${quoted(list, '"')}"` }];
      return [{ start: spot.start, end: spot.end, text: quoted(list, spot.quote) }];
    },
    describe: ({ classes }, before) => (before.editable ? diff(before.classes, classes) : 'classes'),
  });
}

function spotOf(element: JSXOpeningElement, code: string, helpers: Set<string>): Spot {
  const attr = element.attributes.find(
    (a): a is JSXAttribute =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && (a.name.name === 'className' || a.name.name === 'class'),
  );
  if (attr === undefined) return { kind: 'missing', at: element.name.end };
  const { value } = attr;
  if (value?.type === 'Literal') return list(value, code);
  if (value?.type !== 'JSXExpressionContainer' || value.expression.type === 'JSXEmptyExpression')
    return { kind: 'fixed', source: code.slice(attr.start, attr.end) };
  const e = value.expression;
  const whole = listIn(e, code);
  if (whole !== undefined) return whole;
  if (e.type === 'CallExpression' && e.callee.type === 'Identifier' && helpers.has(e.callee.name)) {
    const [first, ...others] = e.arguments;
    const head = first === undefined || first.type === 'SpreadElement' ? undefined : listIn(first, code);
    if (head !== undefined) {
      const rest = others.length === 0 ? undefined : code.slice(others[0]!.start, others.at(-1)!.end);
      return rest === undefined ? head : { ...head, rest };
    }
  }
  return { kind: 'fixed', source: code.slice(attr.start, attr.end) };
}

/** A string literal or a template with nothing interpolated, as the text between its quotes. */
function listIn(e: Expression, code: string): List | undefined {
  if (e.type === 'Literal' && typeof e.value === 'string') return list(e, code);
  if (e.type === 'TemplateLiteral' && e.expressions.length === 0) return list(e, code);
  return undefined;
}

const list = (node: { start: number; end: number }, code: string): List => ({
  kind: 'list',
  start: node.start + 1,
  end: node.end - 1,
  quote: code[node.start]!,
});

/** The list as it may sit between `quote`s. A JSX attribute has no escapes, so a quote of its own kind can't. */
function quoted(list: string, quote: string): string {
  if (quote === '`') return list.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
  if (!list.includes(quote)) return list;
  throw new Refusal(`a class can't hold ${quote} here: use the other quote inside arbitrary values, as in content-['…']`);
}

/** What changed between two lists: `+ring -px-2`. */
function diff(before: string, after: string): string {
  const was = new Set(before.split(/\s+/).filter(Boolean));
  const now = new Set(after.split(/\s+/).filter(Boolean));
  const parts = [...[...now].filter((c) => !was.has(c)).map((c) => `+${c}`), ...[...was].filter((c) => !now.has(c)).map((c) => `-${c}`)];
  return parts.length > 0 ? parts.join(' ') : 'reordered classes';
}

export default tailwind;
