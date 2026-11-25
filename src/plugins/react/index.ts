/**
 * `deictic/react`: what React's DevTools would show of the element a task is about, attached to the task as
 * `react.json`. The component that wrote the element and the ones that wrote it in turn, each with its props, and
 * its state: a class's, or a function's hooks, named as the code names them where the source says (`count`, not
 * `State`). Read with bippy (an optional peer, imported as a task first asks for it) in development only, as React
 * keeps who wrote an element only there. No tab, and nothing in the page of its own: the tasks plugin asks it, and
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
