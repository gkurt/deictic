/// <reference types="vite/client" />

/** The homepage's code as highlighted tokens, made by `code.ts` beside the bundler. */
declare module 'virtual:code' {
  /** A run of one colour (none: the text's own). */
  export type Token = { text: string; color?: string };
  export type Line = Token[];
  export type Code = { source: Line[]; setups: { name: string; lines: Line[] }[] };
  const code: Code;
  export default code;
}
