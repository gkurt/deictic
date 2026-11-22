/**
 * The homepage's code, highlighted here, beside the bundler: the page imports the tokens (`virtual:code`) and no
 * highlighter, whose WebAssembly would weigh more than the rest of the page.
 *
 * The theme is CSS variables only: each token's colour is `var(--hls-<its kind>)`, and `src/site.css` sets the ones
 * the site colours, for light and for dark. A kind it doesn't set is drawn as the text around it.
 */
import { codeToTokens, type Lang, type Theme } from '@pierre/highlights';
import type { Code, Line } from 'virtual:code';
import type { Plugin } from 'vite';

/** The demo's file. `home.tsx` says where each of its tags opens (`AT`, `LINES`): change them together. */
const SOURCE = `export function Plan() {
  return (
    <article>
      <h3>Pro</h3>
      <p>$12 / month</p>
      <button>Upgrade</button>
    </article>
  );
}`;

const THEME: Theme = { name: 'site', appearance: 'light', style: {}, cssVariables: true };

function highlight(code: string, lang: Lang): Line[] {
  return codeToTokens(code, { lang, theme: THEME }).tokens.map((line) =>
    line.map(({ content, color }) => (color === undefined ? { text: content } : { text: content, color })),
  );
}

const ID = 'virtual:code';

export function highlighted(): Plugin {
  const code: Code = {
    source: highlight(SOURCE, 'tsx'),
  };
  return {
    name: 'highlighted-code',
    resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
    load: (id) => (id === `\0${ID}` ? `export default ${JSON.stringify(code)};` : undefined),
  };
}
