/**
 * A component's props, state and hooks as JSON: what a person would see of them in React's DevTools, for an agent
 * to read in a file. Anything JSON can't hold says what it was, in brackets (`[function onClick]`, `[<Button>]`,
 * `[circular]`), and what's too deep or too long is cut where it says so, as a page's values may be its whole store.
 */
import { MASKED, sensitive } from '#src/plugins/network/mask.ts';

import type { Value } from './index.ts';

export interface Limits {
  /** How deep into objects and arrays. */
  depth: number;
  /** How many keys of an object, and items of an array, a Map or a Set. */
  items: number;
  /** How long a string, in characters. */
  text: number;
}

export const LIMITS: Limits = { depth: 5, items: 50, text: 1000 };

const ELEMENTS = new Set([Symbol.for('react.transitional.element'), Symbol.for('react.element')]);

/** A function's or a class's name, or nothing for one with none. */
const nameOf = (fn: unknown): string | undefined => {
  if (typeof fn !== 'function' && (typeof fn !== 'object' || fn === null)) return undefined;
  const { displayName, name } = fn as { displayName?: unknown; name?: unknown };
  const found = displayName ?? name;
  return typeof found === 'string' && found !== '' ? found : undefined;
};

/** `<Button>` for a React element: its tag, or its component's name through `memo` and `forwardRef`. */
function elementName(type: unknown): string {
  if (typeof type === 'string') return type;
  let at = type as { render?: unknown; type?: unknown } | null | undefined;
  for (let depth = 0; depth < 4 && at !== null && at !== undefined; depth++) {
    const name = nameOf(at);
    if (name !== undefined) return name;
    at = (at.render ?? at.type) as typeof at;
  }
  return 'Anonymous';
}

const cut = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit)}… (${text.length - limit} more)` : text);

/** What a value read as, as JSON, its secrets blanked by their names (and `mask`'s, a part of a name in any case). */
export function serialize(value: unknown, mask: readonly string[] = [], limits: Limits = LIMITS): Value | undefined {
  const above = new Set<object>();
  const walk = (value: unknown, depth: number): Value | undefined => {
    switch (typeof value) {
      case 'undefined':
        return undefined;
      case 'boolean':
        return value;
      case 'number':
        return Number.isFinite(value) ? value : `[${value}]`;
      case 'bigint':
        return `[${value}n]`;
      case 'string':
        return cut(value, limits.text);
      case 'symbol':
        return `[${value.toString()}]`;
      case 'function':
        return `[function${nameOf(value) === undefined ? '' : ` ${nameOf(value)}`}]`;
      case 'object':
        break;
    }
    if (value === null || typeof value !== 'object') return null;
    const object = value as Record<PropertyKey, unknown>;
    if (ELEMENTS.has(object.$$typeof as symbol)) return `[<${elementName(object.type)}>]`;
    // A DOM node, told by its shape: `instanceof Node` is another window's in an iframe.
    if (typeof object.nodeType === 'number' && typeof object.nodeName === 'string') {
      const { nodeType, nodeName } = object as { nodeType: number; nodeName: string };
      return nodeType === 1 ? `[<${nodeName.toLowerCase()}>]` : `[${nodeName}]`;
    }
    if (typeof window !== 'undefined' && value === window) return '[window]';
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[Invalid Date]' : value.toISOString();
    if (value instanceof RegExp) return `[${value.toString()}]`;
    if (value instanceof Error) return `[${value.name}: ${cut(value.message, limits.text)}]`;
    if (typeof object.then === 'function') return '[Promise]';
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
      return `[${nameOf(value.constructor) ?? 'Buffer'}(${value.byteLength} bytes)]`;
    if (above.has(value)) return '[circular]';
    const many = Array.isArray(value) ? value.length : value instanceof Map || value instanceof Set ? value.size : undefined;
    if (depth >= limits.depth) {
      if (Array.isArray(value)) return `[Array(${value.length})]`;
      if (value instanceof Map) return `[Map(${value.size})]`;
      if (value instanceof Set) return `[Set(${value.size})]`;
      return `[${nameOf(value.constructor) ?? 'Object'}]`;
    }
    above.add(value);
    try {
      const items = (entries: Iterable<unknown>, of: (item: unknown) => Value) => {
        const out: Value[] = [];
        for (const item of entries) {
          if (out.length === limits.items) {
            out.push(`[… ${(many ?? 0) - limits.items} more]`);
            break;
          }
          out.push(of(item));
        }
        return out;
      };
      // Undefined, in an array, is a hole JSON writes as null: said, so it isn't read as null.
      const inside = (item: unknown) => walk(item, depth + 1) ?? '[undefined]';
      if (Array.isArray(value)) return items(value, inside);
      if (value instanceof Set) return { [`Set(${value.size})`]: items(value, inside) };
      if (value instanceof Map) {
        const pair = (entry: unknown) => {
          const [key, item] = entry as [unknown, unknown];
          return [inside(key), typeof key === 'string' && sensitive(key, mask) ? MASKED : inside(item)];
        };
        return { [`Map(${value.size})`]: items(value, pair) };
      }
      const out: { [key: string]: Value } = {};
      // A class's instance says which, as DevTools does; a plain object, or one of no prototype, doesn't.
      const proto = Object.getPrototypeOf(value) as object | null;
      const made = proto === null || proto === Object.prototype ? undefined : nameOf(proto.constructor);
      if (made !== undefined) out['@'] = made;
      const keys = Object.keys(value);
      for (const key of keys.slice(0, limits.items)) {
        let item: unknown;
        try {
          item = object[key];
        } catch {
          // A getter that throws.
          out[key] = '[unreadable]';
          continue;
        }
        const read = sensitive(key, mask) ? MASKED : walk(item, depth + 1);
        if (read !== undefined) out[key] = read;
      }
      if (keys.length > limits.items) out['…'] = `${keys.length - limits.items} more keys`;
      return out;
    } finally {
      above.delete(value);
    }
  };
  return walk(value, 0);
}
