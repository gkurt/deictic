/**
 * The replay page on the deployed site, where no dev server makes it: the build publishes it as `replay.html`, with
 * `rrweb-player`'s own build beside it. Which recording is `?id=`, and the page asks for it where it's kept: in the
 * page that made it (`src/standalone.ts`), over a `BroadcastChannel`, which reaches a frame of that page and a tab
 * of its own alike. So a replay plays for as long as that page stays open.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { replayPage } from 'deictic/recordings';
import type { Plugin } from 'vite';

/** The channel a replay asks on. `src/standalone.ts` answers on the same. */
export const CHANNEL = 'deictic-demo';

/** Sets what the replay page asks for a recording and its voice clips: the page that keeps them, or nothing in time. */
const SOURCE = `const channel = new BroadcastChannel(${JSON.stringify(CHANNEL)});
const ask = (kind, id) =>
  new Promise((resolve, reject) => {
    const late = setTimeout(
      () => reject(new Error('This recording was kept by the page that made it, which is closed or was reloaded: record again there.')),
      3000,
    );
    channel.addEventListener('message', function heard({ data }) {
      if (data.answer !== kind || data.id !== id) return;
      clearTimeout(late);
      channel.removeEventListener('message', heard);
      resolve(data.found);
    });
    channel.postMessage({ ask: kind, id });
  });
globalThis.deicticReplay = {
  recording: (id) => ask('recording', id),
  clip: async (id) => URL.createObjectURL(await ask('clip', id)),
};
`;

export function replay(): Plugin {
  const player = dirname(createRequire(import.meta.url).resolve('rrweb-player'));
  const files = {
    'replay.html': replayPage({ player: './replay', source: './replay/source.js' }),
    'replay/source.js': SOURCE,
    'replay/player.js': readFileSync(join(player, 'rrweb-player.umd.min.cjs')),
    'replay/player.css': readFileSync(join(player, 'style.css')),
  };
  return {
    name: 'replay-page',
    apply: 'build',
    generateBundle() {
      for (const [fileName, source] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
