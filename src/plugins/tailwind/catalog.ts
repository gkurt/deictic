/**
 * What the project's Tailwind knows, for the panel: every class it can make (to complete what's typed), what
 * each one sets (a colour to show, a value to hint), the classes of the same kind (to switch between), and a
 * class's CSS (to preview one no file uses yet).
 *
 * All of it comes from Tailwind's own design system, loaded from the project (v4, through `@tailwindcss/node`,
 * which every v4 integration brings), so the theme is the project's. Two classes are of a kind when they set the
 * same properties: `text-sm` and `text-lg`, `flex` and `grid`, but not `text-sm` and `text-red-500`.
 */
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A class as the panel shows it. */
export interface ClassInfo {
  name: string;
  /** Whether Tailwind makes anything of it: a class of the project's own isn't known. */
  known: boolean;
  /** The colour it sets, as CSS. */
  color?: string;
  /** What it sets its main property to, theme values resolved: `0.875rem`. */
  value?: string;
  /** A variant to go on typing after (`hover:`), not a class. */
  variant?: true;
}

/** The classes of one kind, and how to write one with a value of the user's own. */
export interface Alternatives {
  /** The property the kind sets: `font-size`. */
  label: string;
  /** Whether the kind is a colour's, shown as swatches. */
  colors: boolean;
  items: ClassInfo[];
  /** A custom value goes between these: `md:text-[` and `]`. None for a kind that takes no value (`flex`). */
  custom?: { before: string; after: string; value?: string };
}

export interface Catalog {
  /** Classes for what's typed, the best first: those starting with it, variants, then those holding it. */
  complete(query: string, limit?: number): ClassInfo[];
  info(classes: string[]): ClassInfo[];
  alternatives(name: string): Alternatives | undefined;
  /** CSS for the classes, in Tailwind's order, theme values written out: for a page whose build hasn't seen them. */
  css(classes: string[]): string;
}

/** The part of Tailwind's design system used here. Unstable there, so everything read from it is checked. */
interface DesignSystem {
  getClassList(): [string, { modifiers?: string[] }][];
  getVariants(): { name: string; values: string[]; hasDash: boolean }[];
  candidatesToCss(classes: string[]): (string | null)[];
  parseCandidate(candidate: string): Iterable<{ kind: string; root?: string; value?: { kind: string; value: string } | null }>;
  resolveThemeValue(path: string): string | undefined;
  getClassOrder(classes: string[]): [string, bigint | null][];
}

interface Entry {
  name: string;
  /** The kind: the properties it sets, sorted. */
  kind: string;
  color?: string;
  value?: string;
}

/** Packages that depend on `@tailwindcss/node`, where the project doesn't itself. */
const VIA = ['@tailwindcss/vite', '@tailwindcss/postcss', '@tailwindcss/cli', '@tailwindcss/webpack'];
const MOST = 400;
const natural = new Intl.Collator('en', { numeric: true }).compare;

/**
 * The catalog of the project at `root`, from its stylesheet (`css`, from the root: the one that imports
 * Tailwind and holds the theme), or from Tailwind's defaults without one. Read again when that file changes.
 * Rejects where the project has no Tailwind v4.
 */
export async function loadCatalog(root: string, css?: string): Promise<Catalog> {
  const { __unstable__loadDesignSystem: load } = await tailwindOf(root);
  const file = css === undefined ? undefined : resolve(root, css);
  const build = async () =>
    catalogOf(
      file === undefined
        ? await load('@import "tailwindcss";', { base: root })
        : await load(readFileSync(file, 'utf8'), { base: dirname(file) }),
    );
  const stamp = () => (file === undefined ? 0 : statSync(file).mtimeMs);
  let built = stamp();
  let current = await build();
  // The latest build, rebuilt when the stylesheet changed since. One that fails (a file half-saved) keeps the last.
  const latest = (): Catalog => {
    const now = stamp();
    if (now !== built) {
      built = now;
      void build().then(
        (next) => (current = next),
        () => {},
      );
    }
    return current;
  };
  return {
    complete: (query, limit) => latest().complete(query, limit),
    info: (classes) => latest().info(classes),
    alternatives: (name) => latest().alternatives(name),
    css: (classes) => latest().css(classes),
  };
}

type Loader = (css: string, options: { base: string }) => Promise<DesignSystem>;

async function tailwindOf(root: string): Promise<{ __unstable__loadDesignSystem: Loader }> {
  const from = createRequire(join(root, 'package.json'));
  const found = [
    () => from.resolve('@tailwindcss/node'),
    ...VIA.map((via) => () => createRequire(from.resolve(via)).resolve('@tailwindcss/node')),
  ];
  for (const find of found) {
    let path: string;
    try {
      path = find();
    } catch {
      continue;
    }
    const module = (await import(pathToFileURL(path).href)) as { __unstable__loadDesignSystem?: Loader };
    if (typeof module.__unstable__loadDesignSystem === 'function')
      return { __unstable__loadDesignSystem: module.__unstable__loadDesignSystem };
  }
  throw new Error(`no Tailwind v4 in ${root}: install @tailwindcss/node there (or one of ${VIA.join(', ')})`);
}

export function catalogOf(design: DesignSystem): Catalog {
  /** A value with the theme's variables written out, and what arithmetic is left done: `calc(var(--spacing) * 4)` is `1rem`. */
  const resolved = (value: string): string => {
    let now = value;
    for (let i = 0; i < 4; i++) {
      const next = now.replace(/var\((--[\w-]+)\)/g, (all, name: string) => themed(name) ?? all);
      if (next === now) break;
      now = next;
    }
    return now.replace(/calc\(([^()]+)\)/g, (all, sum: string) => computed(sum) ?? all);
  };
  const themed = (name: string): string | undefined => {
    try {
      return design.resolveThemeValue(name) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const entryOf = (name: string, css: string): Entry => {
    const set = declarations(css);
    const kind = [...new Set(set.map(([property]) => property))].toSorted().join(',');
    const color = set.findLast(([property, value]) => COLOR.test(property) && !NO_COLOR.test(value))?.[1];
    const main = (set.find(([property]) => !property.startsWith('--')) ?? set[0])?.[1];
    return {
      name,
      kind,
      ...(color === undefined ? {} : { color: resolved(color) }),
      ...(main === undefined ? {} : { value: resolved(main) }),
    };
  };

  const names = design
    .getClassList()
    .map(([name]) => name)
    .toSorted(natural);
  const modifiers = new Map(design.getClassList().map(([name, { modifiers = [] }]) => [name, modifiers]));
  const sheets = design.candidatesToCss(names);
  const byName = new Map<string, Entry>();
  const kinds = new Map<string, Entry[]>();
  names.forEach((name, i) => {
    const css = sheets[i];
    if (css === null || css === undefined) return;
    const entry = entryOf(name, css);
    if (entry.kind === '') return;
    byName.set(name, entry);
    const kind = kinds.get(entry.kind);
    if (kind === undefined) kinds.set(entry.kind, [entry]);
    else kind.push(entry);
  });
  for (const kind of kinds.values()) kind.sort(byValue(kind));

  const variants = design
    .getVariants()
    .flatMap(({ name, values, hasDash }) => [name, ...values.map((value) => `${name}${hasDash ? '-' : ''}${value}`)])
    // `*` and `**` are variants too, and so are those that only take a value in brackets: neither completes a word.
    .filter((name) => /^[@\w]/.test(name))
    .toSorted(natural);

  /** A class Tailwind makes on asking, not in its list: one with a value in brackets, a modifier, a fraction. */
  const made = new Map<string, Entry | undefined>();
  const make = (body: string): Entry | undefined => {
    if (made.has(body)) return made.get(body);
    const css = design.candidatesToCss([body])[0];
    const entry = css === null || css === undefined ? undefined : entryOf(body, css);
    made.set(body, entry?.kind === '' ? undefined : entry);
    return made.get(body);
  };
  const rootOf = (body: string): string | undefined => {
    for (const candidate of design.parseCandidate(body))
      if (candidate.kind === 'functional' && candidate.root !== undefined && candidate.value) return candidate.root;
    return undefined;
  };
  /** The entry of a class's own part (no variants, no `!`), and the kind it's of among the listed ones. */
  const find = (body: string): { entry: Entry; kind: string } | undefined => {
    const listed = byName.get(body);
    if (listed !== undefined) return { entry: listed, kind: listed.kind };
    const entry = make(body);
    if (entry === undefined) return undefined;
    if (kinds.has(entry.kind)) return { entry, kind: entry.kind };
    // `text-[13px]` sets the size alone, `text-sm` the line height too: the kind is the nearest one of its root's.
    const root = rootOf(body);
    if (root === undefined) return { entry, kind: entry.kind };
    const own = new Set(entry.kind.split(','));
    let best: { kind: string; shared: number } | undefined;
    for (const name of names) {
      if (!name.startsWith(`${root}-`)) continue;
      const kind = byName.get(name)?.kind;
      if (kind === undefined || kind === best?.kind) continue;
      const shared = kind.split(',').filter((property) => own.has(property)).length;
      if (shared > (best?.shared ?? 0)) best = { kind, shared };
    }
    return { entry, kind: best?.kind ?? entry.kind };
  };
  const shown = (name: string, entry: Entry): ClassInfo => ({
    name,
    known: true,
    ...(entry.color === undefined ? {} : { color: entry.color }),
    ...(entry.value === undefined ? {} : { value: entry.value }),
  });
  const info = (name: string): ClassInfo => {
    const found = find(parts(name).body);
    return found === undefined ? { name, known: false } : shown(name, found.entry);
  };

  return {
    complete(query, limit = 40) {
      const { before: variantsBefore, bang, body, after } = parts(query.trim());
      if (body === '' && variantsBefore === '') return [];
      const before = `${variantsBefore}${bang}`;
      const starts: ClassInfo[] = [];
      const holds: ClassInfo[] = [];
      const add = (to: ClassInfo[], name: string, entry: Entry) => {
        if (to.length < limit) to.push(shown(`${before}${name}${after}`, entry));
      };
      const exact = byName.get(body);
      if (exact !== undefined) add(starts, body, exact);
      for (const name of names) {
        if (starts.length >= limit) break;
        if (name === body) continue;
        const entry = byName.get(name);
        if (entry === undefined) continue;
        if (name.startsWith(body)) add(starts, name, entry);
        else if (body.length > 1 && name.includes(body)) add(holds, name, entry);
      }
      // `bg-red-500/`: the modifiers the class takes.
      const slash = body.lastIndexOf('/');
      const base = slash < 0 ? undefined : byName.get(body.slice(0, slash));
      const modified =
        base === undefined || starts.length > 0
          ? []
          : (modifiers.get(base.name) ?? [])
              .filter((modifier) => modifier.startsWith(body.slice(slash + 1)))
              .map((modifier) => shown(`${before}${base.name}/${modifier}${after}`, make(`${base.name}/${modifier}`) ?? base));
      const ahead =
        after !== '' || bang !== '' || body === ''
          ? []
          : variants
              .filter((name) => name.startsWith(body))
              .map((name): ClassInfo => ({ name: `${before}${name}:`, known: true, variant: true }));
      return [...starts, ...modified, ...ahead, ...holds].slice(0, limit);
    },
    info: (classes) => classes.map(info),
    alternatives(name) {
      const { before, bang, body, after } = parts(name);
      const found = find(body);
      if (found === undefined) return undefined;
      const { modifier, base } = modified(body, byName);
      const kind = kinds.get(found.kind) ?? [];
      const properties = found.kind.split(',');
      const root = rootOf(body);
      const value = [...design.parseCandidate(body)].find((candidate) => candidate.value?.kind === 'arbitrary')?.value?.value;
      const items = kind.slice(0, MOST).map((entry) => shown(`${before}${bang}${entry.name}${modifier}${after}`, entry));
      // The class itself where it isn't listed (its value is its own), so the panel has it to show as chosen.
      if (!kind.some((entry) => entry.name === base)) items.unshift(shown(name, found.entry));
      return {
        label: properties.find((property) => !property.startsWith('--')) ?? properties[0]!,
        colors: kind.filter((entry) => entry.color !== undefined).length * 2 > kind.length,
        items,
        ...(root === undefined
          ? {}
          : { custom: { before: `${before}${bang}${root}-[`, after: `]${modifier}${after}`, ...(value === undefined ? {} : { value }) } }),
      };
    },
    css(classes) {
      const bodies = [...new Set(classes)];
      const order = new Map(design.getClassOrder(bodies));
      bodies.sort((a, b) => {
        const [x, y] = [order.get(a) ?? null, order.get(b) ?? null];
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
        return x < y ? -1 : x > y ? 1 : 0;
      });
      const properties = new Set<string>();
      const rules = design
        .candidatesToCss(bodies)
        .filter((css) => css !== null && css !== undefined)
        // `@property` can't sit in a layer, so each is lifted out, once.
        .map((css) =>
          css.replace(PROPERTY, (rule) => {
            properties.add(rule.trim());
            return '';
          }),
        )
        .join('');
      if (rules.trim() === '') return '';
      // In the layer the page's own utilities are in, so what beats them there (the page's unlayered CSS) beats these.
      return `${[...properties].join('\n')}\n@layer utilities {\n${rules.replace(/var\((--[\w-]+)\)/g, (all, name: string) => themed(name) ?? all)}}\n`;
    },
  };
}

const COLOR = /(^|-)color$|^fill$|^stroke$|^--tw-gradient-(from|via|to)$/;
const NO_COLOR = /^(inherit|none|initial|unset)$/;
const PROPERTY = /@property [^{]+\{[^}]*\}\n?/g;

/** A rule's declarations, in order, from Tailwind's CSS for one class: one a line, `@property` rules after. */
function declarations(css: string): [property: string, value: string][] {
  const rules = css.replace(PROPERTY, '');
  return [...rules.matchAll(/^\s+(-{0,2}[\w-]+):\s*(.+?)(?:\s*!important)?;$/gm)].map((match) => [match[1]!, match[2]!]);
}

/** `0.25rem * 4` as `1rem`: products and quotients of numbers with one unit between them. Anything else is left. */
function computed(sum: string): string | undefined {
  const tokens = sum.trim().split(/\s+/);
  let total = 1;
  let unit = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (i % 2 === 1) {
      if (token !== '*' && token !== '/') return undefined;
      continue;
    }
    const match = /^(-?(?:\d+\.?\d*|\.\d+))(%|[a-z]+)?$/.exec(token);
    if (match === null) return undefined;
    const divides = tokens[i - 1] === '/';
    if (match[2] !== undefined && (unit !== '' || divides)) return undefined;
    unit = match[2] ?? unit;
    total = divides ? total / Number(match[1]) : total * Number(match[1]);
  }
  if (tokens.length % 2 === 0 || !Number.isFinite(total)) return undefined;
  return `${Number(total.toFixed(4))}${unit}`;
}

/** A length as a number to order by, where the value is one: `1rem` is 16. */
function measure(value: string | undefined): number | undefined {
  const match = value === undefined ? null : /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|%)?$/.exec(value);
  if (match === null) return undefined;
  return Number(match[1]) * (match[2] === 'rem' || match[2] === 'em' ? 16 : 1);
}

/** A kind's order: by size where most of it has one (`text-xs` before `text-sm`), by name else, as it already is. */
function byValue(kind: Entry[]): (a: Entry, b: Entry) => number {
  const sizes = new Map(kind.map((entry) => [entry, measure(entry.value)]));
  const sized = [...sizes.values()].filter((size) => size !== undefined).length;
  if (sized * 10 < kind.length * 7) return () => 0;
  return (a, b) => {
    const [x, y] = [sizes.get(a), sizes.get(b)];
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
    return x - y;
  };
}

/**
 * A class as written, apart: its variants (`md:hover:`), `!` where it leads, its own part, and `!` where it
 * trails. A `:` inside brackets or parentheses is the value's.
 */
function parts(name: string): { before: string; bang: string; body: string; after: string } {
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name[i]!;
    if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
    else if (char === ':' && depth === 0) cut = i + 1;
  }
  const own = name.slice(cut);
  const bang = own.startsWith('!') ? '!' : '';
  const after = !bang && own.endsWith('!') ? '!' : '';
  return { before: name.slice(0, cut), bang, body: own.slice(bang.length, own.length - after.length), after };
}

/** A class's modifier (`/50`) and what it's on, where the whole isn't a class itself, as `w-1/2` is. */
function modified(body: string, listed: Map<string, unknown>): { base: string; modifier: string } {
  const slash = body.lastIndexOf('/');
  if (listed.has(body) || slash < 0 || body.indexOf(']', slash) >= 0) return { base: body, modifier: '' };
  return { base: body.slice(0, slash), modifier: body.slice(slash) };
}
