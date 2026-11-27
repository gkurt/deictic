/**
 * Editing a project's own source the way it's written: its quotes, semicolons, line endings and indentation. What
 * `init` adds to a bundler's config and to a Bun server goes through here.
 */
import type MagicString from 'magic-string';
import type { Program } from 'oxc-parser';

/** The file's line ending. */
export const eolOf = (code: string) => (code.includes('\r\n') ? '\r\n' : '\n');

/** The whitespace a line starts with, for the line `offset` is on. */
export function indentAt(code: string, offset: number): string {
  const start = code.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(code.slice(start))![0];
}

/**
 * Adds import lines after the module's last import (or `require`, in CommonJS), or at its top: written in the quotes
 * and semicolons of its first import. Each line is `[what, from]`: `import ${what} from '${from}'`, or as a `require`.
 */
export function addImports(out: MagicString, program: Program, code: string, lines: [string, string][], commonjs = false): void {
  const eol = eolOf(code);
  const imports = program.body.filter((s) => s.type === 'ImportDeclaration');
  const first = imports[0];
  const quote = first === undefined ? "'" : code[first.source.start]!;
  const semi = first === undefined || code.slice(first.start, first.end).trimEnd().endsWith(';') ? ';' : '';
  const q = (s: string) => `${quote}${s}${quote}`;
  const text = lines
    .map(([what, from]) => (commonjs ? `const ${what} = require(${q(from)})${semi}` : `import ${what} from ${q(from)}${semi}`))
    .join(eol);
  const after = imports.at(-1) ?? requiresOf(program).at(-1);
  if (after === undefined) out.prepend(`${text}${eol}${eol}`);
  else out.appendLeft(after.end, `${eol}${text}`);
}

/** The top-level `const … = require(…)` statements of a CommonJS module, to put new ones after. */
function requiresOf(program: Program) {
  return program.body.filter(
    (s) =>
      s.type === 'VariableDeclaration' &&
      s.declarations.some(
        (d) => d.init?.type === 'CallExpression' && d.init.callee.type === 'Identifier' && d.init.callee.name === 'require',
      ),
  );
}

/** Inserts `text` as the first property of the object literal that starts at `open` (its `{`), as the object is laid out. */
export function addFirst(out: MagicString, code: string, open: number, first: { start: number } | undefined, text: string): void {
  const eol = eolOf(code);
  if (first === undefined) {
    out.appendLeft(open + 1, ` ${text} `);
    return;
  }
  const multiline = code.slice(open, first.start).includes('\n');
  out.appendLeft(first.start, multiline ? `${text},${eol}${indentAt(code, first.start)}` : `${text}, `);
}

/** Appends `text` after the array's last element, before its `]` at `close`, as the array is laid out (a trailing comma kept). */
export function addLast(out: MagicString, code: string, last: { end: number }, close: number, text: string): void {
  const between = code.slice(last.end, close);
  const comma = between.indexOf(',');
  const eol = eolOf(code);
  const indent = indentAt(code, last.end);
  if (!between.includes('\n')) {
    out.appendLeft(last.end, `, ${text}`);
    return;
  }
  if (comma === -1) out.appendLeft(last.end, `,${eol}${indent}${text}`);
  else out.appendLeft(last.end + comma + 1, `${eol}${indent}${text},`);
}
