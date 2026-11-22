/**
 * `deictic vb`: the board's CLI as the other commands run it, the project's own `@vercel/board`, which needn't be on
 * the PATH, on the board the dev server uses (`BOARD_URL`, or with none, the one `.deictic/board.json` names).
 */
import { vbHere } from './board.ts';

export function run(args: string[]): void {
  process.exit(vbHere(args));
}
