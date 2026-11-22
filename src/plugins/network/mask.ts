/**
 * What a request is kept as: with what it carries that's a secret blanked, wherever a name says so. The
 * names are all there is to go by, so a secret under a name that says nothing (a token in a path, a password in
 * prose) isn't found: bodies and headers are kept only where asked for, and `ignore` leaves a request out whole.
 */

/** A request as rrweb's network plugin has it: all this reads of one, and changes. */
export interface Request {
  name: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string | null;
  responseBody?: string | null;
}

export interface Masking {
  /** More names whose values are blanked, as these are: a part of the name, in any case. */
  mask: string[];
  /** Requests left out: a part of the URL. */
  ignore: string[];
}

/** What a blanked value reads as. */
export const MASKED = '***';
/** What's kept of a body at most, in characters. */
const BODY = 10_000;

/** A name with one of these in it holds a secret, in any case: `access_token`, `X-Api-Key`, `Set-Cookie`. */
const PARTS = [
  'token',
  'secret',
  'passw',
  'pwd',
  'auth',
  'cookie',
  'session',
  'credential',
  'signature',
  'apikey',
  'api-key',
  'api_key',
  'jwt',
  'otp',
  'cvv',
  'cvc',
  'ssn',
  'cardnumber',
  'card_number',
];
/** And these whole names, too short to look for inside others: `code` is OAuth's, on its way back. */
const NAMES = new Set(['key', 'pass', 'code', 'pin', 'sig', 'sid']);
/** deictic's own requests: a recording sends itself as it goes, which would be a request to record each second. */
const OURS = '/__deictic/';

export const sensitive = (name: string, more: readonly string[] = []): boolean => {
  const lower = name.toLowerCase();
  return NAMES.has(lower) || PARTS.some((part) => lower.includes(part)) || more.some((part) => lower.includes(part.toLowerCase()));
};

function maskParams(params: URLSearchParams, more: readonly string[]): boolean {
  let changed = false;
  for (const name of new Set(params.keys())) {
    if (!sensitive(name, more)) continue;
    params.set(name, MASKED);
    changed = true;
  }
  return changed;
}

/** The URL without a name and password before its host, and with its secrets blanked: the query's, and a fragment's that reads as one. */
export function maskUrl(url: string, more: readonly string[] = []): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not one this can read: kept as it is, as there's no telling its parts.
    return url;
  }
  let changed = parsed.username !== '' || parsed.password !== '';
  parsed.username = parsed.password = '';
  if (maskParams(parsed.searchParams, more)) changed = true;
  if (parsed.hash.includes('=')) {
    const fragment = new URLSearchParams(parsed.hash.slice(1));
    if (maskParams(fragment, more)) {
      parsed.hash = fragment.toString();
      changed = true;
    }
  }
  // As it was written where nothing changed: a parsed URL spells some things its own way.
  return changed ? parsed.href.replaceAll(encodeURIComponent(MASKED), MASKED) : url;
}

export function maskHeaders(headers: Record<string, string>, more: readonly string[] = []): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, sensitive(name, more) ? MASKED : value]));
}

function maskJson(value: unknown, more: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((item) => maskJson(item, more));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([name, inner]) => [name, sensitive(name, more) ? MASKED : maskJson(inner, more)]));
}

/** A body with its secrets blanked where it's JSON or a form's fields, cut where it's long: other text has no names to go by. */
export function maskBody(body: string, more: readonly string[] = []): string {
  const cut = (text: string) => (text.length > BODY ? `${text.slice(0, BODY)}… (${text.length} characters)` : text);
  const text = body.trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return cut(JSON.stringify(maskJson(JSON.parse(text), more)));
    } catch {
      // Not JSON after all.
    }
  }
  // A form's fields: `name=value&…`, with nothing a sentence would have.
  if (/^[^\s=&]+=[^\s&]*(&[^\s=&]+=[^\s&]*)*$/.test(text)) {
    const fields = new URLSearchParams(text);
    if (maskParams(fields, more)) return cut(fields.toString().replaceAll(encodeURIComponent(MASKED), MASKED));
  }
  return cut(body);
}

/** The request as it's kept, or nothing for one left out. */
export function maskRequest<R extends Request>(request: R, { mask, ignore }: Masking): R | undefined {
  if (request.name.includes(OURS) || ignore.some((part) => request.name.includes(part))) return undefined;
  return {
    ...request,
    name: maskUrl(request.name, mask),
    ...(request.requestHeaders ? { requestHeaders: maskHeaders(request.requestHeaders, mask) } : {}),
    ...(request.responseHeaders ? { responseHeaders: maskHeaders(request.responseHeaders, mask) } : {}),
    ...(typeof request.requestBody === 'string' ? { requestBody: maskBody(request.requestBody, mask) } : {}),
    ...(typeof request.responseBody === 'string' ? { responseBody: maskBody(request.responseBody, mask) } : {}),
  };
}
