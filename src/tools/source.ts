/**
 * The source a server half reads: a target's file, parsed, and the opening tag the page's attribute
 * points at. Files are only ever read and written under the project's root, outside `node_modules`.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { type JSXOpeningElement, parseSync, Visitor } from 'oxc-parser';

import { Refusal, type Source, type Target, type TextEdit } from '#src/index.ts';

import { isHost, lineStarts, offsetOf } from './locate.ts';

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

/** The target's file and element, as they are on disk now. */
export function sourceAt(root: string, target: Target): Source {
  const { file, line, column } = target.loc;
  const code = readSource(root, file);
  const { program, errors } = parseSync(file, code);
  if (errors.length > 0) throw new Refusal(`${file} doesn't parse: fix it first (${errors[0]!.message})`);
  const offset = offsetOf(lineStarts(code), line, column);
  let element: JSXOpeningElement | undefined;
  new Visitor({
    JSXOpeningElement(el) {
      if (el.start === offset && isHost(el)) element = el;
    },
  }).visit(program);
  if (element === undefined || (element.name.type === 'JSXIdentifier' && element.name.name !== target.tag))
    throw new Refusal(`no <${target.tag}> at ${file}:${line}:${column} any more: the file changed since the page loaded, so reload it`);
  return { file, code, program, element, read: (other) => readSource(root, other) };
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
