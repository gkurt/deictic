/** Projects on disk under `test/.tmp/`, one folder per test, for what reads and writes files. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Target } from '#src/index.ts';
import { lineStarts, position } from '#src/tools/locate.ts';

const TMP = join(import.meta.dir, '.tmp');
let count = 0;

export function project(files: Record<string, string>) {
  const root = join(TMP, `${process.pid}-${count++}`);
  rmSync(root, { recursive: true, force: true });
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return {
    root,
    read: (file: string) => readFileSync(join(root, file), 'utf8'),
    write: (file: string, text: string) => writeFileSync(join(root, file), text),
    /** The target at the first `<tag` in a file, as the page would send it. */
    target(file: string, tag: string, nth = 0): Target {
      const code = readFileSync(join(root, file), 'utf8');
      let at = -1;
      for (let i = 0; i <= nth; i++) at = code.indexOf(`<${tag}`, at + 1);
      return { loc: { file, ...position(lineStarts(code), at) }, tag };
    },
  };
}
