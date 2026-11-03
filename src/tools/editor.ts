/**
 * Opens a place in the editor, for a dev server without a launcher of its own (webpack's, Rspack's):
 * `launch-editor`, which Vite's own launcher uses, finds the editor that's running or the one `EDITOR`
 * names. An optional peer, imported when first asked.
 */

import type { Loc } from '#src/index.ts';

export async function openInEditor(path: string, { line, column }: Loc): Promise<Response> {
  const launcher = await import('launch-editor').catch(() => undefined);
  if (launcher === undefined)
    return new Response('deictic opens files with launch-editor here: add it to your devDependencies', { status: 501 });
  return new Promise((done) => {
    let failed = false;
    launcher.default(`${path}:${line}:${column}`, (_, message) => {
      failed = true;
      done(new Response(`${message ?? "the editor didn't open"}: set EDITOR to your editor's command`, { status: 500 }));
    });
    // launch-editor reports a failure as it happens, and nothing on success.
    setTimeout(() => failed || done(new Response(null, { status: 204 })), 50);
  });
}
