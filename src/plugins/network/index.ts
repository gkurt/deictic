/**
 * `deictic/network`: the requests the page makes while it's recorded, in the recording, each as it ends. No tab,
 * and nothing of its own: it hands the recordings plugin rrweb's network plugin
 * (`@rrweb/rrweb-plugin-network-record`, an optional peer), whose events are rrweb's (`rrweb/network@1`).
 *
 * By default a request is its URL, its status and its timing, which the browser reports of itself
 * (`PerformanceObserver`): nothing of the page's is wrapped, and no method is known. `headers` and `body` add those
 * and the method, for which rrweb wraps `fetch` and `XMLHttpRequest` while a recording is going, and only then.
 *
 * Everything kept is masked first (`mask.ts`): a secret in a URL's query, a header or a body's field is blanked by
 * its name, and deictic's own requests are left out.
 */
import { definePlugin } from '#src/index.ts';
import type { Recorded } from '#src/plugins/recordings/index.ts';

export { MASKED, maskBody, maskHeaders, maskRequest, maskUrl, sensitive } from './mask.ts';

export interface NetworkOptions {
  /**
   * What made the requests kept, as the browser names it (a resource's `initiatorType`): `['fetch',
   * 'xmlhttprequest']` by default, the page's own calls. `'img'`, `'script'`, `'css'` and the like add what it loads.
   */
  initiators?: string[];
  /** Keeps each request's and response's headers, the secret ones blanked (`Authorization`, `Cookie`, …): not by default. */
  headers?: boolean;
  /**
   * Keeps each request's and response's body, cut at 10,000 characters, secrets blanked by name where it's JSON or a
   * form's fields: not by default. `true` is JSON, text and forms; a list names the content types, by a part of each.
   */
  body?: boolean | string[];
  /** More names whose values are blanked, in a query, a header or a body: a part of the name, in any case (`['email']`). */
  mask?: string[];
  /** Requests left out whole: a part of the URL (`['/analytics', 'sentry.io']`). */
  ignore?: string[];
}

/** The options as the page half gets them. */
export interface Resolved {
  initiators: string[];
  headers: boolean;
  body: false | string[];
  mask: string[];
  ignore: string[];
}

declare module 'deictic' {
  interface ClientApis {
    network: Recorded;
  }
}

/** The bodies kept with `body: true`: what reads as text. */
const TEXT = ['application/json', '+json', 'text/', 'application/x-www-form-urlencoded', 'application/xml'];

export function network(options: NetworkOptions = {}) {
  return definePlugin<never, never>({
    name: 'network',
    client: 'deictic/network/client',
    packages: ['@rrweb/rrweb-plugin-network-record'],
    clientOptions: {
      initiators: options.initiators ?? ['fetch', 'xmlhttprequest'],
      headers: options.headers ?? false,
      body: options.body === true ? TEXT : (options.body ?? false),
      mask: options.mask ?? [],
      ignore: options.ignore ?? [],
    } satisfies Resolved,
  });
}

export default network;
