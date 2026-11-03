import { deictic } from 'deictic/bun';
import { tailwind } from 'deictic/tailwind';

// One file for both: bunfig.toml names it as the dev server's bundler plugin, and the server spreads
// its routes, deictic's endpoints, into its own.
export default deictic({ plugins: [tailwind()] });
