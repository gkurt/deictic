import { expect, test } from 'bun:test';

import { logs } from '#src/plugins/logs/index.ts';
import { maskBody, maskHeaders, maskRequest, maskUrl, network, sensitive } from '#src/plugins/network/index.ts';
import { clientModule } from '#src/vite.ts';

const NONE = { mask: [], ignore: [] };

test('a name says what holds a secret: a part of it, in any case, or one of a few short ones whole', () => {
  for (const name of ['Authorization', 'access_token', 'X-Api-Key', 'Set-Cookie', 'password', 'client_secret', 'code', 'key', 'sessionId'])
    expect([name, sensitive(name)]).toEqual([name, true]);
  // A short one inside another word is that word.
  for (const name of ['keyboard', 'postcode', 'page', 'content-type', 'name', 'id']) expect([name, sensitive(name)]).toEqual([name, false]);
  expect(sensitive('userEmail', ['email'])).toBe(true);
});

test('a URL keeps its shape and loses its secrets: the query’s, a fragment’s, a password before the host', () => {
  expect(maskUrl('https://api.test/plans?page=2&access_token=abc123&sort=asc')).toBe(
    'https://api.test/plans?page=2&access_token=***&sort=asc',
  );
  expect(maskUrl('https://user:hunter2@api.test/plans')).toBe('https://api.test/plans');
  expect(maskUrl('https://app.test/callback#id_token=eyJ&state=x')).toBe('https://app.test/callback#id_token=***&state=x');
  expect(maskUrl('https://api.test/users?email=a%40b.test', ['email'])).toBe('https://api.test/users?email=***');
  // Nothing to blank: as it was written.
  expect(maskUrl('https://api.test/plans?q=a%20b#top')).toBe('https://api.test/plans?q=a%20b#top');
  expect(maskUrl('not a url')).toBe('not a url');
});

test('headers and bodies lose theirs by name, at any depth, and a long body is cut', () => {
  expect(maskHeaders({ Authorization: 'Bearer abc', 'content-type': 'application/json', cookie: 'sid=1' })).toEqual({
    Authorization: '***',
    'content-type': 'application/json',
    cookie: '***',
  });
  expect(maskBody('{"user":{"name":"Ada","password":"hunter2","tokens":[{"refresh_token":"r"}]},"plan":"pro"}')).toBe(
    '{"user":{"name":"Ada","password":"***","tokens":"***"},"plan":"pro"}',
  );
  expect(maskBody('[{"apiKey":"k","id":1}]')).toBe('[{"apiKey":"***","id":1}]');
  expect(maskBody('grant_type=password&password=hunter2&username=ada')).toBe('grant_type=password&password=***&username=ada');
  // Prose has no names to go by, and stays.
  expect(maskBody('my password = hunter2')).toBe('my password = hunter2');
  expect(maskBody('{ not json')).toBe('{ not json');
  const long = maskBody('x'.repeat(20_000));
  expect(long).toStartWith('x'.repeat(10_000));
  expect(long).toEndWith('… (20000 characters)');
});

test('a request is masked whole, and deictic’s own and the ignored are left out', () => {
  const request = {
    name: 'https://api.test/login?key=abc',
    method: 'POST',
    status: 200,
    requestHeaders: { authorization: 'Bearer abc' },
    requestBody: '{"password":"hunter2"}',
    responseHeaders: { 'set-cookie': 'sid=1', etag: 'W/1' },
    responseBody: '{"token":"t","user":"ada"}',
  };
  expect(maskRequest(request, NONE)).toEqual({
    name: 'https://api.test/login?key=***',
    method: 'POST',
    status: 200,
    requestHeaders: { authorization: '***' },
    requestBody: '{"password":"***"}',
    responseHeaders: { 'set-cookie': '***', etag: 'W/1' },
    responseBody: '{"token":"***","user":"ada"}',
  });
  // What the browser reports of itself has no headers or bodies, and gets none.
  expect(maskRequest({ name: 'https://api.test/plans', status: 200 }, NONE)).toEqual({ name: 'https://api.test/plans', status: 200 });
  expect(maskRequest({ name: 'http://localhost:5173/__deictic/plugins/recordings/part/x?seq=1' }, NONE)).toBeUndefined();
  expect(maskRequest({ name: 'https://o1.ingest.sentry.io/api/1/envelope/' }, { mask: [], ignore: ['sentry.io'] })).toBeUndefined();
  expect(maskRequest({ name: 'https://api.test/users?email=a' }, { mask: ['email'], ignore: [] })?.name).toBe(
    'https://api.test/users?email=***',
  );
});

test('by default a request is what the browser reports of it: no headers, no bodies, the page’s own calls', () => {
  const code = clientModule([network(), logs()], '/');
  expect(code).toContain(`{"options":{"initiators":["fetch","xmlhttprequest"],"headers":false,"body":false,"mask":[],"ignore":[]}}`);
  expect(clientModule([network({ headers: true, body: true, mask: ['email'], ignore: ['/analytics'] })], '/')).toContain(
    `{"options":{"initiators":["fetch","xmlhttprequest"],"headers":true,"body":["application/json","+json","text/","application/x-www-form-urlencoded","application/xml"],"mask":["email"],"ignore":["/analytics"]}}`,
  );
  expect(clientModule([logs({ levels: ['warn', 'error'] })], '/')).toContain(`{"options":{"levels":["warn","error"]}}`);
});
