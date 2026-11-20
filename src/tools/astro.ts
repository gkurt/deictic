/**
 * `.astro` components. They aren't JSX modules, but Astro 7's own parser reads a template as JSX, into the
 * tree oxc makes (offsets in UTF-16, as ours are), so its host elements are marked as a JSX module's are,
 * before Astro compiles the file. The parser is the project's own Astro's (`@astrojs/compiler-rs`, found
 * through `astro`), so it reads a file exactly as the compiler will; an Astro before 7 has none like it,
 * and its `.astro` files are left unmarked.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { JSXOpeningElement, Program } from 'oxc-parser';

import { type Located, marked } from './locate.ts';

export const ASTRO = /\.astro$/;

/** A file parsed: its module (an `.astro` file's frontmatter), and each opening tag in it, in the file's order. */
export interface Parsed {
  program: Program;
  elements: JSXOpeningElement[];
}

interface Tree {
  ast: { frontmatter: { program: Program }; body: unknown };
  diagnostics: { severity: string; text: string }[];
}
type Parse = (code: string) => Tree;

const parsers = new Map<string, Parse | undefined>();

/** The parser of the Astro installed for the project at `root`, loaded once; nothing without Astro 7. */
function parserOf(root: string): Parse | undefined {
  if (!parsers.has(root)) parsers.set(root, load(root));
  return parsers.get(root);
}

function load(root: string): Parse | undefined {
  try {
    // Astro's own dependency, which a strict package manager doesn't put where the project could import it.
    const astro = createRequire(createRequire(join(root, 'package.json')).resolve('astro/package.json'));
    // An ES module, required: every Node that runs Astro 7 can, and reading a source stays synchronous.
    const compiler: { parse?: Parse } = astro('@astrojs/compiler-rs');
    return compiler.parse;
  } catch {
    return undefined;
  }
}

/**
 * Astro gives a `<script>` or `<style>` with an attribute it doesn't know to the page as it is, unbundled and
 * unscoped, and a `<slot>` isn't an element at all: none of them can be pointed at, so none is marked.
 */
const OWN = new Set(['script', 'style', 'slot']);

const isOpening = (node: object): node is JSXOpeningElement => 'type' in node && node.type === 'JSXOpeningElement';

/** An `.astro` file's text parsed, or the `problem` with it: no parser (an older Astro), or text that doesn't parse. */
export function parseAstro(root: string, code: string): Parsed | { problem: string } {
  const parse = parserOf(root);
  if (parse === undefined) return { problem: 'reading an .astro file takes Astro 7 or later, so update astro' };
  const { ast, diagnostics } = parse(code);
  const error = diagnostics.find((d) => d.severity === 'error');
  if (error !== undefined) return { problem: `fix it first (${error.text})` };
  const elements: JSXOpeningElement[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    if (isOpening(node) && !(node.name.type === 'JSXIdentifier' && OWN.has(node.name.name))) elements.push(node);
    Object.values(node).forEach(walk);
  };
  walk(ast.body);
  return { program: ast.frontmatter.program, elements };
}

/** An `.astro` file's text with every host element marked, as `locate` marks a JSX module; nothing where it can't be read. */
export function locateAstro(code: string, file: string, root: string): Located | undefined {
  // No tag, no parse.
  if (!/<[a-z]/.test(code)) return undefined;
  const parsed = parseAstro(root, code);
  return 'problem' in parsed ? undefined : marked(code, file, parsed.elements);
}
