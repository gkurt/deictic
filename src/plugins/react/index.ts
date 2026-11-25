/**
 * `deictic/react`: what React's DevTools would show of the element a task is about, attached to the task as
 * `react.json`. The component that wrote the element and the ones that wrote it in turn, each with its props, and
 * its state: a class's, or a function's hooks, named as the code names them where the source says (`count`, not
 * `State`). Read with bippy (an optional peer, imported as a task first asks for it) in development only, as React
 * keeps who wrote an element only there. Each says how often it rendered, how long that took and why, as DevTools'
 * profiler would, counted from React's commits. No tab, and nothing in the page of its own: the tasks plugin asks it, and
 * sends what it answers beside the element's HTML, while the panel's HTML snapshot box is ticked.
 *
 * Values are what the page holds, so they're masked as the network plugin's are, by their names (`token`,
 * `password`, `auth`…, and `mask`'s), and cut where they're deep or long.
 */
import { definePlugin } from '#src/index.ts';

export interface ReactOptions {
  /** How many components, out from the one that wrote the element: 4 by default. */
  components?: number;
  /** More names whose values are blanked: a part of the name, in any case. */
  mask?: string[];
  /**
   * Whether hooks are named as the code names them, read off the source and its map (fetched from the dev server, as
   * DevTools does): true by default. Without, each is its kind alone, `State` or `Memo`, in the order they're called.
   */
  names?: boolean;
  /**
   * Whether each component's renders are counted, timed and explained, from React's commits as DevTools' hook hears
   * them: true by default. That hook is React Refresh's, in development; without one there's nothing to count.
   */
  renders?: boolean;
}

/** What JSON holds of a value: anything it can't hold says what it was, in brackets (`[function onClick]`). */
export type Value = null | boolean | number | string | Value[] | { [key: string]: Value };

/** A hook as DevTools lists it. */
export interface Hook {
  /** Its kind: `State`, `Memo`, `Context`, or a custom hook's name less `use` (`Auth`), whose `hooks` it called. */
  hook: string;
  /** What the code calls it: `const [count, setCount] = useState(0)` is `count`. */
  as?: string;
  value?: Value;
  hooks?: Hook[];
}

/** A component's renders, counted from when the page started deictic, not from its first. */
export interface Renders {
  count: number;
  /** In the 10 seconds before the task: a loop, or a burst on each keystroke. */
  recent: number;
  /** How long ago it last rendered, in milliseconds. */
  lastAgo: number;
  /** How long its last render took, with what it rendered, in milliseconds: where React times them. */
  lastMs?: number;
  /** Its own part of it. */
  selfMs?: number;
  /** Why it last rendered: `mounted`, `props changed: chosen`, `state changed`, `context changed`, `its parent rendered`. */
  why: string;
}

/** A component that rendered in a recording's commit, once for each time it did in the entry. */
export interface Rendered {
  name: string;
  /** Where its JSX has the first element it wrote, `src/Plan.tsx:12`, where it wrote one. */
  at?: string;
  /** How many times it rendered in the entry, where that's more than once. */
  count?: number;
  /** How long it took, with what it rendered, in milliseconds, all its renders in the entry together. */
  ms?: number;
  /** Its own part of it. */
  selfMs?: number;
  /** Why it last rendered, as `Renders.why`. */
  why: string;
}

/**
 * A recording's entry of React's commits, `deictic.react` events: commits a frame apart, as one, with the components
 * they rendered, the slowest first. `{ on: boolean }` events say where the recording starts and stops having them.
 */
export interface Commit {
  /** How many commits it is. */
  commits: number;
  /** How long rendering them took, in milliseconds, where React times it. */
  ms?: number;
  /** Of several, the slowest one's, in milliseconds: one past a frame is what makes a page stutter. */
  slowest?: number;
  /**
   * The rest of a busy second, past ten entries in it: how long it spans, in milliseconds, up to this entry's
   * moment. A page that renders without stop is ten entries and this one a second.
   */
  over?: number;
  /** React's scheduler priority for the last: `immediate` (a click, a key), `user-blocking`, `normal`, `low`, `idle`. */
  priority?: string;
  /** Twenty at most. */
  components: Rendered[];
  /** How many more components rendered than it names. */
  more?: number;
}

/** A component that wrote the element, or wrote one that did. */
export interface Component {
  name: string;
  /** Where its JSX has the nearest element around this one, `src/Plan.tsx:12`: none for one that only passed it on. */
  at?: string;
  /** A server component: React kept its name, and nothing of it is in the page. */
  server?: true;
  props?: Value;
  /** A class component's state. */
  state?: Value;
  /** A function component's hooks, in the order it calls them, effects left out. */
  hooks?: Hook[];
  renders?: Renders;
  /** Why what's missing is. */
  problem?: string;
}

/** `react.json`: the component that wrote the element first, then the one that wrote it, and on out. */
export interface Snapshot {
  components: Component[];
}

export function reactState(options: ReactOptions = {}) {
  return definePlugin<never, never>({
    name: 'react',
    client: 'deictic/react/client',
    packages: ['bippy'],
    clientOptions: { ...options },
  });
}

export default reactState;
