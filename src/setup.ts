/**
 * `deictic/setup`: a bundler's config edited as `deictic init` edits it, for a tool that sets a project up beside
 * deictic. Build-time only, like the CLI.
 */
import MagicString from 'magic-string';
import { type Expression, type ObjectExpression, parseSync, type Program } from 'oxc-parser';

import { addFirst, addImports, addLast } from './cli/edit.ts';

type Node = Expression | ObjectExpression;

/**
 * The object an expression comes to: through `defineConfig(…)`, `(…)`, `satisfies`, a function's return and a top-level
 * `const`. Not through another call: in `mergeConfig(base, {…})` or webpack-merge's `merge(common, {…})` the first
 * argument is a base the project may build with too, and the plugin isn't the base's.
 */
function objectOf(node: Node | null | undefined, program: Program, depth = 0): ObjectExpression | undefined {
  if (node == null || depth > 8) return undefined;
  const next = (n: Node | null | undefined) => objectOf(n, program, depth + 1);
  if (node.type === 'ObjectExpression') return node;
  if (node.type === 'ParenthesizedExpression' || node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression')
    return next(node.expression);
  if (node.type === 'CallExpression') {
    const { callee } = node;
    const named = (callee.type === 'Identifier' ? callee : callee.type === 'MemberExpression' ? callee.property : undefined) as
      { type: string; name?: string } | undefined;
    const [first] = node.arguments;
    if (named?.name !== 'defineConfig' || first === undefined || first.type === 'SpreadElement') return undefined;
    return next(first);
  }
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    const body = node.body;
    if (body === null) return undefined;
    if (body.type !== 'BlockStatement') return next(body);
    const returned = body.body.findLast((s) => s.type === 'ReturnStatement');
    return returned?.type === 'ReturnStatement' ? next(returned.argument) : undefined;
  }
  if (node.type !== 'Identifier') return undefined;
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration') continue;
    const found = declaration.declarations.find((d) => d.id.type === 'Identifier' && d.id.name === node.name);
    if (found !== undefined) return next(found.init);
  }
  return undefined;
}

/** The config's exported value: `export default …` or `module.exports = …`, and whether it's CommonJS. */
function exportedOf(program: Program): { value: Expression; commonjs: boolean } | undefined {
  for (const statement of program.body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      const value = statement.declaration;
      return value.type.endsWith('Declaration') && value.type !== 'FunctionDeclaration'
        ? undefined
        : { value: value as Expression, commonjs: false };
    }
    if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'AssignmentExpression') continue;
    const { left, right } = statement.expression;
    const exports =
      left.type === 'MemberExpression' &&
      left.object.type === 'Identifier' &&
      left.object.name === 'module' &&
      left.property.type === 'Identifier' &&
      left.property.name === 'exports';
    if (exports) return { value: right, commonjs: true };
  }
  return undefined;
}

/** What a tool adds to a bundler's config: its imports, and a value in one of the config's lists or around it whole. */
export interface ConfigEntry {
  /** Each import, as `[what, from]`: `['{ deictic }', 'deictic/vite']`. */
  imports: [string, string][];
  /** The value added to `list`, or, with `wrap`, what follows the config in the call: `{ plugins: [] }`, or nothing. */
  value: string;
  /** The exported object's list it goes in: `plugins`, `integrations`. */
  list?: string;
  /** The function the whole of the exported config is passed to instead (Next's `withDeictic`). */
  wrap?: string;
  /** After the list's others, where it goes first by default. */
  last?: boolean;
}

/**
 * The config with the entry added, or nothing where it can't tell where: its imports after the config's, and its
 * value in the list or around the whole config, written in the config's quotes, semicolons and line endings. What
 * `deictic init` adds deictic with, for a tool setting a project up beside it (prosebook's `init`).
 */
export function addToConfig(file: string, code: string, entry: ConfigEntry): string | undefined {
  const { program, errors } = parseSync(file, code, { preserveParens: false });
  if (errors.length > 0) return undefined;
  const exported = exportedOf(program);
  if (exported === undefined) return undefined;
  const out = new MagicString(code);

  if (entry.wrap !== undefined) {
    out.appendLeft(exported.value.start, `${entry.wrap}(`);
    out.appendRight(exported.value.end, entry.value === '' ? ')' : `, ${entry.value})`);
  } else {
    const object = objectOf(exported.value, program);
    if (object === undefined || entry.list === undefined || !addTo(out, code, object, entry)) return undefined;
  }

  addImports(out, program, code, entry.imports, exported.commonjs);
  return out.toString();
}

/** Adds the entry's value to the object's array `list`, or the list with it, as the object is laid out. False where `list` isn't an array. */
function addTo(out: MagicString, code: string, object: ObjectExpression, { list, value, last }: ConfigEntry): boolean {
  const property = object.properties.find(
    (p) =>
      p.type === 'Property' &&
      !p.computed &&
      ((p.key.type === 'Identifier' && p.key.name === list) || (p.key.type === 'Literal' && p.key.value === list)),
  );
  if (property !== undefined) {
    if (property.type !== 'Property') return false;
    let array = property.value;
    while (array.type === 'TSAsExpression' || array.type === 'TSSatisfiesExpression') array = array.expression;
    if (array.type !== 'ArrayExpression') return false;
    const elements = array.elements.filter((e) => e !== null);
    if (elements.length === 0) {
      out.appendLeft(array.start + 1, value);
      return true;
    }
    if (last) addLast(out, code, elements.at(-1)!, array.end - 1, value);
    else addFirst(out, code, array.start, elements[0], value);
    return true;
  }
  addFirst(out, code, object.start, object.properties[0], `${list}: [${value}]`);
  return true;
}
