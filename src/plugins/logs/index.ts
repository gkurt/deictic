/**
 * `deictic/logs`: what the page logs while it's recorded, and the errors nothing caught, in the recording, each at
 * its moment. No tab, and nothing of its own: it hands the recordings plugin rrweb's console plugin
 * (`@rrweb/rrweb-plugin-console-record`, an optional peer), whose events are rrweb's (`rrweb/console@1`).
 *
 * A wrapped console names the wrapper, not the caller, as each line's source in the browser's tools. rrweb wraps it
 * as a recording starts and puts it back as it stops, so it's the page's own the rest of the time. Leave the plugin
 * out and it never is.
 */
import { definePlugin } from '#src/index.ts';
import type { Recorded } from '#src/plugins/recordings/index.ts';

/** What of the console is kept: its methods, by name. */
export type Level =
  | 'assert'
  | 'count'
  | 'countReset'
  | 'debug'
  | 'dir'
  | 'dirxml'
  | 'error'
  | 'group'
  | 'groupCollapsed'
  | 'info'
  | 'log'
  | 'table'
  | 'time'
  | 'timeEnd'
  | 'timeLog'
  | 'trace'
  | 'warn';

export interface LogsOptions {
  /**
   * The console's methods kept, `['warn', 'error']` for the least: every one that says something by default. Errors
   * nothing caught, and rejections nothing handled, come with `error`.
   */
  levels?: Level[];
}

declare module 'deictic' {
  interface ClientApis {
    logs: Recorded;
  }
}

export function logs(options: LogsOptions = {}) {
  return definePlugin<never, never>({
    name: 'logs',
    client: 'deictic/logs/client',
    packages: ['@rrweb/rrweb-plugin-console-record'],
    clientOptions: { levels: options.levels },
  });
}

export default logs;
