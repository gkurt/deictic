/**
 * `deictic/astro`: the Vite plugin (`vite.ts`) in `astro dev`, and the overlay on every page.
 *
 * Astro renders a page on the server and may send it with no script at all, so nothing in the browser
 * would import the client module, which under Vite comes with the first JSX module. The integration
 * injects it into every page instead. JSX components (React's, Preact's, Solid's) are marked, on the
 * server and in islands; `.astro` components aren't JSX, and aren't.
 */
import { CLIENT, deictic as vitePlugin, type DeicticOptions } from './vite.ts';

export type { DeicticOptions as DeicticIntegrationOptions };

/** What the integration reads of Astro's setup hook: Astro's own types, as far as they're used here. */
interface Setup {
  command: 'dev' | 'build' | 'preview' | 'sync';
  updateConfig: (config: { vite: { plugins: unknown[] } }) => void;
  injectScript: (stage: 'page', content: string) => void;
}

export function deictic(options: DeicticOptions = {}) {
  return {
    name: 'deictic',
    hooks: {
      'astro:config:setup': ({ command, updateConfig, injectScript }: Setup) => {
        if (command !== 'dev') return;
        updateConfig({ vite: { plugins: [vitePlugin(options)] } });
        injectScript('page', `import ${JSON.stringify(CLIENT)};`);
      },
    },
  };
}

export default deictic;
