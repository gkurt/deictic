/** The logs plugin's page half: rrweb's console plugin, imported as a recording first asks for it. */
import { defineClientPlugin } from '#src/index.ts';
import type { Recorded } from '#src/plugins/recordings/index.ts';

import type { Level } from './index.ts';

export default defineClientPlugin<never, never, Recorded>({
  name: 'logs',
  setup: ({ options }) => ({
    plugin: async () => {
      const { getRecordConsolePlugin } = await import('@rrweb/rrweb-plugin-console-record').catch((e: unknown) => {
        throw new Error('logs needs @rrweb/rrweb-plugin-console-record: add it to your devDependencies', { cause: e });
      });
      const { levels } = (options ?? {}) as { levels?: Level[] };
      return getRecordConsolePlugin(levels === undefined ? {} : { level: levels });
    },
  }),
});
