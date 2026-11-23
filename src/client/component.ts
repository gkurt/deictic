/**
 * The component that wrote an element, where the page can say: with React in development, which keeps who wrote
 * each element on its fiber. Anything else (another framework, a production build) says nothing, and an element is
 * then known by its tag alone.
 */

/**
 * What React keeps, in development, of who wrote an element: a fiber (its `type` the component), or for a server
 * component its `name`. Each has the one that wrote it in turn. A fiber has what it rendered under it, too.
 */
export interface Owner {
  name?: unknown;
  type?: unknown;
  alternate?: Owner | null;
  owner?: Owner | null;
  _debugOwner?: Owner | null;
  child?: Owner | null;
  sibling?: Owner | null;
  return?: Owner | null;
}

/** React's fiber of an element it rendered, which it keeps on the element under a key of its own. */
export const fiberOf = (el: Element): Owner | undefined => {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  return key === undefined ? undefined : (el as unknown as Record<string, Owner>)[key];
};

export const ownerOf = (of: Owner | undefined): Owner | undefined => of?._debugOwner ?? of?.owner ?? undefined;

/** A component's name, through `memo` and `forwardRef`, or nothing for one written without. */
export function componentOf(owner: Owner): string | undefined {
  if (typeof owner.name === 'string') return owner.name === '' ? undefined : owner.name;
  let type = owner.type as { displayName?: unknown; name?: unknown; render?: unknown; type?: unknown } | null | undefined;
  for (let depth = 0; depth < 4 && type !== null && type !== undefined; depth++) {
    // A function's own name, where it has no `displayName`; a `memo` or `forwardRef` object has neither.
    const name = type.displayName ?? type.name;
    if (typeof name === 'string' && name !== '') return name;
    type = (type.render ?? type.type) as typeof type;
  }
  return undefined;
}

/** How an element is told to a person: its tag, and the component that wrote it where the page says. */
export interface Named {
  tag: string;
  /** The component whose JSX has the element: `PlanCard`. */
  component?: string;
  /** Whether the element is the only one that component wrote: then the component's name says it all. */
  sole: boolean;
}

/** How far under a component its elements are counted: past that it's taken to have several. */
const LOOKED = 400;

/** Whether `owner` wrote no element but the one: read off what it rendered, which holds what it passed down as children too. */
function wroteOne(owner: Owner): boolean {
  // A component's fiber is one of two, by turns: an element may name either.
  const its = (fiber: Owner | null | undefined) => fiber !== null && fiber !== undefined && (fiber === owner || fiber === owner.alternate);
  let wrote = 0;
  let looked = 0;
  // Down, then across, then back up to the next across: every fiber under it, without a stack.
  for (let at = owner.child; at !== null && at !== undefined;) {
    if (++looked > LOOKED) return false;
    if (typeof at.type === 'string' && its(ownerOf(at)) && ++wrote > 1) return false;
    if (at.child !== null && at.child !== undefined) {
      at = at.child;
      continue;
    }
    while (at.sibling === null || at.sibling === undefined) {
      const up: Owner | null | undefined = at.return;
      // Back at the component: that was all of it.
      if (up === null || up === undefined || its(up)) return wrote === 1;
      at = up;
    }
    at = at.sibling;
  }
  return wrote === 1;
}

// Asked each frame while it's pointed at: an element's answer is kept while the element is.
const known = new WeakMap<Element, Named>();

export function named(el: Element): Named {
  const kept = known.get(el);
  if (kept !== undefined) return kept;
  const owner = ownerOf(fiberOf(el));
  const component = owner === undefined ? undefined : componentOf(owner);
  const answer: Named =
    owner === undefined || component === undefined
      ? { tag: el.localName, sole: false }
      : { tag: el.localName, component, sole: wroteOne(owner) };
  known.set(el, answer);
  return answer;
}

/** `<PlanCard>` for the only element of one, `<PlanCard> <li>` for one of several, `<li>` where no component is known. */
export const tell = ({ tag, component, sole }: Named) =>
  component === undefined ? `<${tag}>` : sole ? `<${component}>` : `<${component}> <${tag}>`;
