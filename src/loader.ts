/**
 * The loader `deictic/webpack` sets for webpack and Rspack, and `deictic/next` for Turbopack: it marks a
 * JSX module's host elements (`tools/locate.ts`), and in the browser appends the import of the client
 * module written to `.deictic/client.js`. It runs `pre`, before the app's own loaders, so lines and
 * columns are the file's as written. Its options are JSON, as Turbopack's must be.
 */
import { importOf, mark } from './tools/integration.ts';

export interface LoaderOptions {
  /** The project's root, which a mark's path is from. */
  root: string;
  /** The written client module, to import in the browser; none on the server. */
  client?: string;
}

interface Context {
  getOptions(): LoaderOptions;
  resourcePath: string;
  sourceMap?: boolean;
  callback(error: Error | null, code?: string, map?: object): void;
}

export default function loader(this: Context, source: string): void {
  const { root, client } = this.getOptions();
  const marked = mark(source, this.resourcePath, root, client === undefined ? '' : importOf(client, this.resourcePath));
  if (marked === undefined) return this.callback(null, source);
  this.callback(null, marked.code, this.sourceMap === false ? undefined : marked.map);
}
