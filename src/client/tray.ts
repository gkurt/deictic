/**
 * The tray: what plugins made on the page that nothing has taken yet (a shot, a recording, a voice clip), for
 * whatever takes it next, as a task does. Kept in the tab's session storage, as JSON, so it's still there on the
 * tab's next page: a recording that carried on to it ends there, and what was taken before it is with it.
 */
import type { Tray, TrayItem } from '#src/index.ts';

const KEY = 'deictic:tray';

function stored(): TrayItem[] {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(kept) ? (kept as TrayItem[]) : [];
  } catch {
    // Storage can be off, or hold something else: an empty tray, then.
    return [];
  }
}

export function tray(): Tray {
  let items = stored();
  const listeners = new Set<() => void>();
  const changed = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      // Not kept past this page, then.
    }
    for (const listener of listeners) listener();
  };
  return {
    list: (plugin) => items.filter((item) => plugin === undefined || item.plugin === plugin),
    add: (plugin, id, value) => {
      items = [...items.filter((item) => item.plugin !== plugin || item.id !== id), { plugin, id, value }];
      changed();
    },
    remove: (plugin, id) => {
      const left = items.filter((item) => item.plugin !== plugin || (id !== undefined && item.id !== id));
      if (left.length === items.length) return;
      items = left;
      changed();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
