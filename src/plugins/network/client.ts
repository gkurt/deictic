/**
 * The network plugin's page half: rrweb's network plugin, imported as a recording first asks for it, with every
 * request masked before rrweb has it.
 */
import { defineClientPlugin } from '#src/index.ts';
import type { Recorded } from '#src/plugins/recordings/index.ts';

import type { Resolved } from './index.ts';
import { maskRequest } from './mask.ts';

export default defineClientPlugin<never, never, Recorded>({
  name: 'network',
  setup: ({ options }) => ({
    plugin: async ({ sinceLoad }) => {
      const { getRecordNetworkPlugin } = await import('@rrweb/rrweb-plugin-network-record').catch((e: unknown) => {
        throw new Error('network needs @rrweb/rrweb-plugin-network-record: add it to your devDependencies', { cause: e });
      });
      const { initiators, headers, body, mask, ignore } = options as Resolved;
      type Options = NonNullable<Parameters<typeof getRecordNetworkPlugin>[0]>;
      return getRecordNetworkPlugin({
        initiatorTypes: initiators as NonNullable<Options['initiatorTypes']>,
        recordHeaders: headers,
        recordBody: body,
        // What the page asked for as it loaded, where the recording was going by then: before, it's not the recording's.
        recordInitialRequests: sinceLoad,
        transformRequestFn: (request) => maskRequest(request, { mask, ignore }),
      });
    },
  }),
});
