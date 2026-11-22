/**
 * A panel's `away`, kept past a page load: the tab, the element's place and the state it left, for the
 * next page to come back with when what it left for carries on there (a recording does).
 *
 * The state may hold what JSON can't (a drawn screenshot is a `Blob`), so it's in IndexedDB, which is the
 * origin's: the tab's session storage holds the key, so each tab comes back to its own.
 */
import type { Target } from '#src/index.ts';

/** What the next page needs to come back: which tab, on what, with what. */
export interface Away {
  tab: string;
  target: Target;
  state: unknown;
}

const KEY = 'deictic:away';
const STORE = 'away';
/** How long one nobody came back to is kept, in milliseconds: its tab was closed. */
const STALE = 24 * 60 * 60 * 1000;

/** One at a time, in the order asked: a `drop` right after a `keep` must not run before it. */
let last: Promise<unknown> = Promise.resolve();

function store<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const next = last
    .catch(() => {})
    .then(
      () =>
        new Promise<T>((done, fail) => {
          const opening = indexedDB.open('deictic', 1);
          opening.addEventListener('upgradeneeded', () => opening.result.createObjectStore(STORE));
          opening.addEventListener('error', () => fail(opening.error));
          opening.addEventListener('success', () => {
            const db = opening.result;
            const transaction = db.transaction(STORE, mode);
            transaction.addEventListener('complete', () => db.close());
            transaction.addEventListener('abort', () => db.close());
            try {
              const request = work(transaction.objectStore(STORE));
              request.addEventListener('error', () => fail(request.error));
              request.addEventListener('success', () => done(request.result));
            } catch (e) {
              // What can't be copied throws as it's put, here, where nothing would hear it.
              fail(e);
            }
          });
        }),
    );
  last = next;
  return next;
}

const keyOf = (): string | undefined => {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    // Storage can be off: nothing is kept past the page, then.
    return undefined;
  }
};

/** Keeps it for the tab's next page. A state that can't be copied (it holds a function, an element) isn't kept, and a page load loses it. */
export function keepAway(away: Away): void {
  try {
    const key = keyOf() ?? crypto.randomUUID();
    sessionStorage.setItem(KEY, key);
    void store('readwrite', (s) => {
      // Those of tabs long closed go as a new one comes.
      const walk = s.openCursor();
      walk.addEventListener('success', () => {
        const cursor = walk.result;
        if (cursor === null) return;
        if (Date.now() - (cursor.value as { at: number }).at > STALE) cursor.delete();
        cursor.continue();
      });
      return s.put({ ...away, at: Date.now() }, key);
    }).catch(() => {});
  } catch {
    // Not kept, then.
  }
}

/** What the page before this left, if it left anything. */
export async function keptAway(): Promise<Away | undefined> {
  const key = keyOf();
  if (key === undefined) return undefined;
  try {
    return await store<Away | undefined>('readonly', (s) => s.get(key));
  } catch {
    return undefined;
  }
}

/** It's come back, or there's nothing to come back for. */
export function dropAway(): void {
  const key = keyOf();
  if (key === undefined) return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // It was readable, so this doesn't happen; and a stale one is dropped by the page that finds it.
  }
  void store('readwrite', (s) => s.delete(key)).catch(() => {});
}
