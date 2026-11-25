import { expect, test } from 'bun:test';

import { type Commit, reactState } from '#src/plugins/react/index.ts';
import { countRenders, type Fiber, type Rendering, renderStats, whyOf } from '#src/plugins/react/renders.ts';
import { serialize } from '#src/plugins/react/serialize.ts';
import { timeline } from '#src/plugins/react/timeline.ts';
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

/** A fiber as React keeps one, of what the counts read. */
const fiber = (tag: number, fields: Partial<Fiber> = {}): Fiber => ({ tag, alternate: null, child: null, sibling: null, ...fields });
const children = (parent: Fiber, ...kids: Fiber[]) => {
  parent.child = kids[0] ?? null;
  kids.forEach((kid, i) => (kid.sibling = kids[i + 1] ?? null));
  return parent;
};
/** The next render of `prev`: its other fiber, as React makes it. */
const next = (prev: Fiber, fields: Partial<Fiber> = {}): Fiber => {
  const made = fiber(prev.tag, { memoizedProps: prev.memoizedProps, memoizedState: prev.memoizedState, ...fields, alternate: prev });
  prev.alternate = made;
  return made;
};

test('counts what each commit rendered, and why, leaving out what React left as it was', () => {
  let time = 0;
  const { commit, read } = renderStats(() => time);
  // A root, a page that renders a card and a list, the list a host element.
  const card = fiber(0, { memoizedProps: { name: 'Hobby' }, actualDuration: 1.234, selfBaseDuration: 0.5 });
  const list = fiber(5);
  const page = children(fiber(0, { memoizedProps: {} }), card, list);
  const root = children(fiber(3), page);
  commit(root);
  expect(read(card)).toEqual({ count: 1, recent: 1, lastAgo: 0, lastMs: 1.23, selfMs: 0.5, why: 'mounted' });

  // The card's props change: it renders, and the page, whose child list React cloned, didn't.
  time = 5000;
  const card2 = next(card, { memoizedProps: { name: 'Pro' }, flags: 1 });
  const page2 = children(next(page), card2, list);
  commit(children(next(root), page2));
  // Read by either of its fibers.
  expect(read(card)).toMatchObject({ count: 2, recent: 2, lastAgo: 0, why: 'props changed: name' });
  expect(read(page2)).toMatchObject({ count: 1, why: 'mounted' });

  // Nothing under a fiber whose children React didn't clone rendered, whatever their flags say.
  time = 20_000;
  const page3 = next(page2, { child: page2.child });
  commit(children(next(root), page3));
  expect(read(card)).toMatchObject({ count: 2, recent: 0, lastAgo: 15_000 });
});

test('says a render was its state, a context or its parent, an effect being no change', () => {
  const hooks = (...states: unknown[]) => states.reduceRight<object | null>((rest, memoizedState) => ({ memoizedState, next: rest }), null);
  const effect = () => ({ tag: 9, create: () => {}, deps: [] });
  const props = { a: 1 };
  const prev = fiber(0, { memoizedProps: props, memoizedState: hooks(1, effect()) });
  expect(whyOf(fiber(0, { memoizedProps: { a: 1 }, memoizedState: hooks(1, effect()) }), prev)).toBe('its parent rendered');
  expect(whyOf(fiber(0, { memoizedProps: props, memoizedState: hooks(2, effect()) }), prev)).toBe('state changed');
  const context = (value: unknown) => ({ firstContext: { memoizedValue: value, next: null } });
  expect(
    whyOf(
      fiber(0, { memoizedProps: { a: 2 }, dependencies: context('dark') }),
      fiber(0, { memoizedProps: props, dependencies: context('light') }),
    ),
  ).toBe('props changed: a; context changed');
  expect(whyOf(fiber(1, { memoizedState: { n: 2 } }), fiber(1, { memoizedState: { n: 1 } }))).toBe('state changed');
});

test("answers DevTools' hook after the handler it had, and counts nothing where there's no hook", () => {
  const heard: number[] = [];
  const hook = { onCommitFiberRoot: (id: number, _root: { current: Fiber }) => void heard.push(id) };
  const counted = countRenders({ __REACT_DEVTOOLS_GLOBAL_HOOK__: hook });
  const card = fiber(0);
  hook.onCommitFiberRoot(1, { current: children(fiber(3), card) });
  expect(heard).toEqual([1]);
  expect(counted?.read(card)).toMatchObject({ count: 1, why: 'mounted' });
  expect(countRenders({})).toBeUndefined();
});

test("a recording's timeline is an entry a frame, the slowest first, and ten a second, then the rest of it as one", () => {
  let time = 0;
  const later: { run: () => void; at: number }[] = [];
  const clock = { now: () => time, later: (run: () => void, ms: number) => void later.push({ run, at: time + ms }) };
  /** Moves the clock on, running what's due by then, in order. */
  const tick = (to: number) => {
    for (;;) {
      later.sort((a, b) => a.at - b.at);
      const next = later[0];
      if (next === undefined || next.at > to) break;
      later.shift();
      time = next.at;
      next.run();
    }
    time = to;
  };
  let listen: ((commit: Rendering) => void) | undefined;
  const subscribe = (given: (commit: Rendering) => void) => {
    listen = given;
    return () => void (listen = undefined);
  };
  const out: Commit[] = [];
  const stop = timeline(subscribe, (c) => out.push(c), clock);
  const row = fiber(0, { type: function Row() {} });
  const list = fiber(0, { type: { displayName: 'List' } });
  // Two commits a frame apart: one entry, each component once, with how often, the slowest first.
  listen!({ ms: 2, priority: 1, rendered: [{ fiber: row, why: 'mounted', selfMs: 0.5 }] });
  listen!({
    ms: 3,
    priority: 2,
    rendered: [
      { fiber: list, why: 'state changed', ms: 3, selfMs: 2 },
      { fiber: row, why: 'its parent rendered', selfMs: 0.5 },
    ],
  });
  tick(16);
  expect(out).toEqual([
    {
      commits: 2,
      ms: 5,
      slowest: 3,
      priority: 'user-blocking',
      components: [
        { name: 'List', why: 'state changed', ms: 3, selfMs: 2 },
        { name: 'Row', why: 'its parent rendered', selfMs: 1, count: 2 },
      ],
    },
  ]);
  // A page that commits each frame: nine more entries this second, then the rest of it as one at its end.
  for (let at = 20; at < 1000; at += 20) {
    listen!({ ms: at === 500 ? 40 : 1, rendered: [{ fiber: row, why: 'state changed', selfMs: 1 }] });
    tick(at + 17);
  }
  // The second started with the first entry, at 16 ms.
  tick(1016);
  expect(out).toHaveLength(11);
  expect(out[9]).toMatchObject({ commits: 1, ms: 1, components: [{ name: 'Row' }] });
  const rest = out[10]!;
  expect(rest).toMatchObject({ commits: 40, slowest: 40, components: [{ name: 'Row', count: 40 }] });
  // From the first entry past ten, a frame after its commit at 197 ms, to the second's end.
  expect(rest.over).toBe(803);
  // Stopped, what's waiting goes first, and nothing after.
  listen!({ ms: 1, rendered: [] });
  stop();
  expect(out.at(-1)).toMatchObject({ commits: 1 });
  expect(listen).toBeUndefined();
});
