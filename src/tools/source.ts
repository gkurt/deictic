/**
 * The source a server half reads: a target's file, parsed, and the opening tag the page's attribute
 * points at. Files are only ever read and written under the project's root, outside `node_modules`.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { Refusal, type Source, type Target, type TextEdit } from '#src/index.ts';

import { ASTRO, parseAstro, type Parsed } from './astro.ts';
import { isHost, lineStarts, offsetOf, openingsIn, parse } from './locate.ts';

/** A file from the project's root, as an absolute path; refused anywhere the page has no business writing. */
export function resolveFile(root: string, file: string): string {
  const path = resolve(root, file);
  const from = relative(root, path);
  // `relative` gives an absolute path for another drive.
  if (from === '' || from.startsWith('..') || isAbsolute(from) || from.split(sep).includes('node_modules'))
    throw new Refusal(`${file} is not a file of this project's own`);
  return path;
}

export function readSource(root: string, file: string): string {
  try {
    return readFileSync(resolveFile(root, file), 'utf8');
  } catch (e) {
    if (e instanceof Refusal) throw e;
    throw new Refusal(`can't read ${file}: has it moved since the page loaded?`, { cause: e });
  }
}

/**
 * The target's file and element, as they are on disk now. The element is the one the page's mark names, or else the
 * only one of its tag on that line: the page may count columns in code a plugin before deictic's changed.
 */
export function sourceAt(root: string, target: Target): Source {
  const { file, line, column } = target.loc;
  const code = readSource(root, file);
  const lines = lineStarts(code);
  const offset = offsetOf(lines, line, column);
  const { program, elements } = ASTRO.test(file) ? astro(root, file, code) : jsx(file, code);
  const tagged = elements.filter((el) => isHost(el) && el.name.type === 'JSXIdentifier' && el.name.name === target.tag);
  const start = lines[line - 1];
  const onLine = start === undefined ? [] : tagged.filter((el) => el.start >= start && el.start < (lines[line] ?? Infinity));
  const element = tagged.find((el) => el.start === offset) ?? (onLine.length === 1 ? onLine[0] : undefined);
  if (element === undefined) throw new Refusal(notThere(target, code, lines, onLine.length));
  return { file, code, program, element, read: (other) => readSource(root, other) };
}

/** Why the page's element isn't in the file, from what the file has there: it may not have changed at all. */
function notThere({ loc: { file, line, column }, tag }: Target, code: string, lines: number[], onLine: number): string {
  const start = lines[line - 1];
  const found =
    start === undefined
      ? `${file} has no line ${line}`
      : onLine === 0
        ? `line ${line} of ${file} has no <${tag}>: it reads \`${clip(code.slice(start, (lines[line] ?? code.length + 1) - 1).trim())}\``
        : `line ${line} of ${file} has ${onLine} <${tag}>s, none at column ${column}`;
  return `${found}. The page isn't running the file as it is: reload it, and if it says this again, a plugin before deictic's changes the file, so put deictic first`;
}

const clip = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);

function jsx(file: string, code: string): Parsed {
  const { program, errors } = parse(file, code);
  if (errors.length > 0) throw new Refusal(`${file} doesn't parse: fix it first (${errors[0]!.message})`);
  return { program, elements: openingsIn(program) };
}

function astro(root: string, file: string, code: string): Parsed {
  const parsed = parseAstro(root, code);
  if ('problem' in parsed) throw new Refusal(`${file} can't be read: ${parsed.problem}`);
  return parsed;
}

/** Each file's text after its edits, which must not overlap. */
export function applyEdits(source: Source, edits: TextEdit[]): Map<string, string> {
  const byFile = Map.groupBy(edits, (e) => e.file ?? source.file);
  const out = new Map<string, string>();
  for (const [file, list] of byFile) {
    const sorted = list.toSorted((a, b) => b.start - a.start);
    let code = file === source.file ? source.code : source.read(file);
    let floor = Infinity;
    for (const edit of sorted) {
      if (edit.end > floor) throw new Error(`deictic: edits to ${file} overlap at ${edit.end}`);
      code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
      floor = edit.start;
    }
    out.set(file, code);
  }
  return out;
}
