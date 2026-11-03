/**
 * Where deictic keeps what it makes for a project: `.deictic/` at its root, beside `.board/` and the like,
 * rather than in `node_modules`, which an install may clear. The history is there, and the shots,
 * recordings and voice clips plugins keep. It ignores itself in git: the history holds whole files, and
 * the rest is the page as it looked, neither of which belongs in a commit.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IGNORE = "# deictic's own: the history, and the shots, recordings and voice clips it keeps.\n*\n";

/** A path under the project's `.deictic/`, made with its `.gitignore` the first time. */
export function keptIn(root: string, ...parts: string[]): string {
  const dir = join(root, '.deictic');
  const ignore = join(dir, '.gitignore');
  if (!existsSync(ignore)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(ignore, IGNORE);
  }
  return join(dir, ...parts);
}
