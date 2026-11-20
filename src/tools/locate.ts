/**
 * Marks each host element in a JSX module with where its opening tag starts:
 * `<div data-deictic="src/App.tsx:12:5">`. The page reads it back to know what was clicked.
 *
 * At build time and not from React's fibers at runtime: it works for any framework that compiles JSX,
 * for server components (which have no fiber in the browser), and it names the element's own tag
 * rather than the component that rendered it. Only host elements (`div`, `button`) are marked, since a
 * component may not pass the attribute on; a component's call site is reached from its elements.
 *
 * The transform must run on the source as written (`enforce: 'pre'` under Vite), so lines and columns
 * are the file's. It runs alike on the server and in the browser, so a hydrated page matches its HTML.
 */
import MagicString from 'magic-string';
import { type JSXOpeningElement, parseSync, type Program, Visitor } from 'oxc-parser';

export const ATTRIBUTE = 'data-deictic';
/** Modules that may hold JSX: `.jsx` and `.tsx`, and plain `.js`, as many React projects write theirs. */
export const JSX = /\.[cm]?(?:[jt]sx|js)$/;

/** A module parsed, with JSX read in a `.js` file too, which the parser reads there only when told. */
export const parse = (file: string, code: string) => parseSync(file, code, /\.[cm]?js$/.test(file) ? { lang: 'jsx' } : undefined);

export interface Located {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
}

/** Whether an opening tag is a host element's, `<div>` or `<svg>`, not a component's or a namespaced one. */
export const isHost = (el: JSXOpeningElement) => el.name.type === 'JSXIdentifier' && /^[a-z]/.test(el.name.name);

/**
 * `code` with every host element marked, `file` being its path from the project's root, and `append`
 * after it (the client's import, in the browser); nothing when there is nothing to mark, or the module
 * doesn't parse, which the framework's own transform reports better.
 */
export function locate(code: string, file: string, append = ''): Located | undefined {
  // No tag, no parse: most `.js` modules have none, and every one of the project's comes through here.
  if (!/<[a-z]/.test(code)) return undefined;
  const { program, errors } = parse(file, code);
  if (errors.length > 0) return undefined;
  return marked(code, file, openingsIn(program), append);
}

/** Every opening tag in a module, in its order. */
export function openingsIn(program: Program): JSXOpeningElement[] {
  const elements: JSXOpeningElement[] = [];
  new Visitor({ JSXOpeningElement: (el) => void elements.push(el) }).visit(program);
  return elements;
}

/**
 * `code` with a mark in each of `elements` that is a host element's and has none yet, and `append` after
 * it; nothing with none to mark.
 */
export function marked(code: string, file: string, elements: JSXOpeningElement[], append = ''): Located | undefined {
  const lines = lineStarts(code);
  const s = new MagicString(code);
  for (const el of elements) {
    if (!isHost(el) || el.attributes.some((a) => a.type === 'JSXAttribute' && nameOf(a.name) === ATTRIBUTE)) continue;
    const { line, column } = position(lines, el.start);
    s.appendLeft(el.name.end, ` ${ATTRIBUTE}="${file}:${line}:${column}"`);
  }
  if (!s.hasChanged()) return undefined;
  if (append !== '') s.append(append);
  // A map's source is read from the module's own folder, so it's the file's name, not its path from the root.
  return { code: s.toString(), map: s.generateMap({ source: file.slice(file.lastIndexOf('/') + 1), hires: 'boundary' }) };
}

const nameOf = (name: { type: string; name?: unknown }) => (name.type === 'JSXIdentifier' ? name.name : undefined);

/** Where each line starts, by offset. */
export function lineStarts(code: string): number[] {
  const starts = [0];
  for (let i = code.indexOf('\n'); i !== -1; i = code.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

/** An offset's line and column, from 1. */
export function position(lines: number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lines[lo]! + 1 };
}

/** A line and column's offset, or nothing past the file's end. */
export function offsetOf(lines: number[], line: number, column: number): number | undefined {
  const start = lines[line - 1];
  return start === undefined ? undefined : start + column - 1;
}
