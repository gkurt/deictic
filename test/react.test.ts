import { expect, test } from 'bun:test';

import { reactState } from '#src/plugins/react/index.ts';
import { serialize } from '#src/plugins/react/serialize.ts';
import { clientModule } from '#src/vite.ts';

test('says what JSON cannot hold, in brackets', () => {
  function onClick() {}
  const element = { $$typeof: Symbol.for('react.transitional.element'), type: { displayName: 'Button' }, props: {} };
  const memo = { $$typeof: Symbol.for('react.element'), type: { $$typeof: Symbol.for('react.memo'), type: function Card() {} } };
  expect(
    serialize({
      onClick,
      arrow: () => {},
      element,
      memo,
      tag: { $$typeof: Symbol.for('react.transitional.element'), type: 'li' },
      node: { nodeType: 1, nodeName: 'DIV' },
      text: { nodeType: 3, nodeName: '#text' },
      big: 10n,
      nan: Number.NaN,
      when: new Date(0),
      pattern: /a+/g,
      error: new TypeError('nope'),
      promise: Promise.resolve(1),
      bytes: new Uint8Array(4),
      gone: undefined,
      holes: [undefined, 1],
      map: new Map([['a', 1]]),
      set: new Set([1, 2]),
      symbol: Symbol('s'),
    }),
  ).toEqual({
    onClick: '[function onClick]',
    arrow: '[function arrow]',
    element: '[<Button>]',
    memo: '[<Card>]',
    tag: '[<li>]',
    node: '[<div>]',
    text: '[#text]',
    big: '[10n]',
    nan: '[NaN]',
    when: '1970-01-01T00:00:00.000Z',
    pattern: '[/a+/g]',
    error: '[TypeError: nope]',
    promise: '[Promise]',
    bytes: '[Uint8Array(4 bytes)]',
    holes: ['[undefined]', 1],
    map: { 'Map(1)': [['a', 1]] },
    set: { 'Set(2)': [1, 2] },
    symbol: '[Symbol(s)]',
  });
});

test('blanks secrets by their names, and the names asked for', () => {
  const props = {
    user: { name: 'Ada', password: 'x', accessToken: 'y' },
    cardNumber: '4242',
    plan: 'pro',
    headers: new Map([['Authorization', 'b']]),
  };
  expect(serialize(props, ['plan'])).toEqual({
    user: { name: 'Ada', password: '***', accessToken: '***' },
    cardNumber: '***',
    plan: '***',
    headers: { 'Map(1)': [['Authorization', '***']] },
  });
});

test('cuts what is deep, long or circular, and says where', () => {
  const loop: Record<string, unknown> = { name: 'loop' };
  loop.self = loop;
  const shared = { n: 1 };
  class Store {
    items = [1, 2, 3, 4];
  }
  const limits = { depth: 3, items: 3, text: 5 };
  expect(
    serialize({ loop, twice: [shared, shared], deep: { a: { b: { c: 1 } } }, long: 'abcdefgh', store: new Store() }, [], limits),
  ).toEqual({
    loop: { name: 'loop', self: '[circular]' },
    // The same object twice isn't a loop.
    twice: [{ n: 1 }, { n: 1 }],
    deep: { a: { b: '[Object]' } },
    '…': '2 more keys',
  });
  expect(serialize(new Store(), [], limits)).toEqual({ '@': 'Store', items: [1, 2, 3, '[… 1 more]'] });
  expect(serialize('abcdefgh', [], limits)).toBe('abcde… (3 more)');
});

test('is a page half with bippy to install, which the client module imports', () => {
  const plugin = reactState({ components: 2, mask: ['plan'] });
  expect(plugin).toMatchObject({
    name: 'react',
    client: 'deictic/react/client',
    packages: ['bippy'],
    clientOptions: { components: 2, mask: ['plan'] },
  });
  expect(clientModule([plugin], '/')).toContain('deictic/react/client');
});
