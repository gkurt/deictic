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
import type { Argument, Expression, JSXAttribute, JSXOpeningElement, Program } from 'oxc-parser';

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
      /** The helper's other arguments, which add classes at runtime, each read as far as the source says. */
      others?: Extra[];
    }
  | { editable: false; source: string };

/** Classes a helper's argument adds: `active && 'ring'` is `ring` when `active`. */
export interface Extra {
  /** The argument, or the part of it these classes come from, as written. */
  source: string;
  /** The classes, where the source spells them out: there, or in a `const` of the file it names. */
  classes?: string;
  /** What must hold for them to be added, as written: `active === 'h3'`. None where they always are. */
  when?: string;
  /** Set where the classes are a string in this file, which an op with `at` can write. */
  editable?: true;
  /** The `const` the string is in, where it isn't the argument itself: other elements may use it too. */
  shared?: string;
}

export interface Op {
  classes: string;
  /** Which of the model's `others` the classes are for, by its place there. The element's own list without. */
  at?: number;
}

/** Where a class list sits in the source: the text between its quotes, or where a missing attribute goes. */
type List = { kind: 'list'; start: number; end: number; quote: string; others?: Argument[] };
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
    read({ code, element, program }) {
      const spot = spotOf(element, code, helpers);
      if (spot.kind === 'fixed') return { editable: false, source: spot.source };
      if (spot.kind === 'missing') return { editable: true, classes: '' };
      const others = spot.others?.flatMap((argument) => extrasOf(argument, code, program)).map(({ spot: _, ...extra }) => extra);
      return { editable: true, classes: code.slice(spot.start, spot.end), ...(others === undefined ? {} : { others }) };
    },
    apply({ file, code, element, program }, _target, { classes, at }) {
      const list = classes.trim().split(/\s+/).filter(Boolean).join(' ');
      const spot = spotOf(element, code, helpers);
      if (spot.kind === 'fixed') throw new Refusal('this class list is built at runtime: edit it in the editor');
      if (at !== undefined) {
        const others = spot.kind === 'list' ? (spot.others ?? []).flatMap((argument) => extrasOf(argument, code, program)) : [];
        const place = others[at]?.spot;
        if (place === undefined)
          throw new Refusal("these classes aren't a string in this file any more: reload, or edit them in the editor");
        return [{ start: place.start, end: place.end, text: quoted(list, place.quote) }];
      }
      // An `.astro` component writes `class`, whatever the JSX beside it does.
      const name = file.endsWith('.astro') ? 'class' : attribute;
      if (spot.kind === 'missing') return list === '' ? [] : [{ start: spot.at, end: spot.at, text: ` ${name}="${quoted(list, '"')}"` }];
      return [{ start: spot.start, end: spot.end, text: quoted(list, spot.quote) }];
    },
    describe({ classes, at }, before) {
      if (!before.editable) return 'classes';
      if (at === undefined) return diff(before.classes, classes);
      const other = before.others?.[at];
      return `${diff(other?.classes ?? '', classes)}${other?.when === undefined ? '' : ` when ${other.when}`}`;
    },
  });
}

function spotOf(element: JSXOpeningElement, code: string, helpers: Set<string>): Spot {
  const attr = element.attributes.find(
    (a): a is JSXAttribute =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && (a.name.name === 'className' || a.name.name === 'class'),
  );
  if (attr === undefined) {
    // Astro's `class:list` is the element's class list too: a `class` beside it would be a second one.
    const listed = element.attributes.find(
      (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'class:list',
    );
    return listed === undefined
      ? { kind: 'missing', at: element.name.end }
      : { kind: 'fixed', source: code.slice(listed.start, listed.end) };
  }
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
    if (head !== undefined) return others.length === 0 ? head : { ...head, others };
  }
  return { kind: 'fixed', source: code.slice(attr.start, attr.end) };
}

/**
 * What one of a helper's arguments adds, and when: `on && 'ring'`, `on ? 'a' : 'b'`, `{ ring: on }`, a string,
 * or a name for one. Anything else is only its source, as nothing says what it adds.
 */
function extrasOf(argument: Argument, code: string, program: Program): (Extra & { spot?: List })[] {
  const source = (node: { start: number; end: number }) => code.slice(node.start, node.end);
  const added = (e: { type: string; start: number; end: number }, when?: string, key = false): Extra & { spot?: List } => {
    const found = stringOf(e, program, !key);
    if (found === undefined) return { source: source(e), ...(when === undefined ? {} : { when }) };
    return {
      source: source(e),
      classes: found.value,
      ...(when === undefined ? {} : { when }),
      editable: true,
      ...(found.shared === undefined ? {} : { shared: found.shared }),
      spot: list(found.node, code),
    };
  };
  const e = argument;
  if (e.type === 'SpreadElement') return [{ source: source(e) }];
  if (e.type === 'LogicalExpression' && e.operator === '&&') return [added(e.right, source(e.left))];
  if (e.type === 'ConditionalExpression') {
    const test = source(e.test);
    const not = e.test.type === 'Identifier' ? `!${test}` : `!(${test})`;
    // A branch that adds nothing (`on ? 'ring' : undefined`) isn't one to show.
    return [added(e.consequent, test), added(e.alternate, not)].filter(
      (extra) => extra.classes !== '' && !/^(undefined|null|false)$/.test(extra.source),
    );
  }
  if (e.type === 'ObjectExpression') {
    return e.properties.map((property): Extra & { spot?: List } => {
      if (property.type !== 'Property' || property.computed) return { source: source(property) };
      const always = property.value.type === 'Literal' && property.value.value === true;
      const when = always ? {} : { when: source(property.value) };
      // A bare key (`ring`) is a class, but not a string to write a list into.
      if (property.key.type === 'Identifier') return { source: source(property), classes: property.key.name, ...when };
      const { source: _, ...key } = added(property.key, undefined, true);
      return key.classes === undefined ? { source: source(property) } : { source: source(property), ...key, ...when };
    });
  }
  return [added(e)];
}

/**
 * A string the source spells out, and where: a literal, a template with nothing interpolated, or a top-level
 * `const` of one (`shared`, its name).
 */
function stringOf(
  e: { type: string },
  program: Program,
  named = true,
): { value: string; node: { start: number; end: number }; shared?: string } | undefined {
  const node = e as Expression;
  if (node.type === 'Literal') return typeof node.value === 'string' ? { value: node.value, node } : undefined;
  if (node.type === 'TemplateLiteral') {
    const value = node.expressions.length === 0 ? node.quasis[0]?.value.cooked : undefined;
    return value === undefined || value === null ? undefined : { value, node };
  }
  if (node.type !== 'Identifier' || !named) return undefined;
  for (const statement of program.body) {
    const declared = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declared?.type !== 'VariableDeclaration' || declared.kind !== 'const') continue;
    for (const { id, init } of declared.declarations) {
      if (id.type !== 'Identifier' || id.name !== node.name || !init) continue;
      const found = stringOf(init, program, false);
      return found === undefined ? undefined : { ...found, shared: node.name };
    }
  }
  return undefined;
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
