/**
 * Keeps deictic's own UI out of a recording. Blocking the overlay keeps it out of the first snapshot,
 * but rrweb watches a blocked host's shadow root all the same, so what's added there later (the toolbar,
 * a note's field) comes as mutations. This drops them, and clicks and input on those nodes, by the IDs
 * rrweb gave them: the host's, and every node added under one of ours.
 *
 * The pointer's moves over them stay, on the page's root instead: the replay moves its cursor only over a
 * node it has, and while a drawing tool is picked the pointer is over ours the whole time.
 */

/** The parts of rrweb's events this reads; the rest passes as it is. */
interface Event {
  type: number;
  data?: unknown;
}

interface Mutation {
  source: 0;
  adds: { parentId: number; node: { id: number } }[];
  removes: { parentId: number; id: number }[];
  texts: { id: number }[];
  attributes: { id: number }[];
}

/** rrweb's numbers: an incremental snapshot, and the sources whose data is a list of pointer positions. */
const INCREMENTAL = 3;
const MUTATION = 0;
const POSITIONS = new Set([1, 6, 12]);

/** A filter for `emit`: the event without our nodes, or nothing when nothing else is left in it. */
export function dropOurs<E extends Event>(hostId: () => number, pageId: () => number): (event: E) => E | undefined {
  const ours = new Set<number>();
  return (event) => {
    if (ours.size === 0) {
      const id = hostId();
      if (id > 0) ours.add(id);
    }
    if (event.type !== INCREMENTAL || typeof event.data !== 'object' || event.data === null) return event;
    const data = event.data as { source: number; id?: number; positions?: { id: number }[] };

    if (data.source === MUTATION) {
      const m = data as Mutation;
      // Added parents and children come in any order: claim until nothing more is ours.
      for (let grew = true; grew;) {
        grew = false;
        for (const add of m.adds) {
          if (ours.has(add.parentId) && !ours.has(add.node.id)) {
            ours.add(add.node.id);
            grew = true;
          }
        }
      }
      const kept: Mutation = {
        ...m,
        adds: m.adds.filter((a) => !ours.has(a.node.id)),
        removes: m.removes.filter((r) => !ours.has(r.id) && !ours.has(r.parentId)),
        texts: m.texts.filter((t) => !ours.has(t.id)),
        attributes: m.attributes.filter((a) => !ours.has(a.id)),
      };
      const left = kept.adds.length + kept.removes.length + kept.texts.length + kept.attributes.length;
      return left === 0 ? undefined : { ...event, data: kept };
    }
    if (POSITIONS.has(data.source) && Array.isArray(data.positions)) {
      const page = pageId();
      const positions = data.positions.map((p) => (ours.has(p.id) ? { ...p, id: page } : p));
      return { ...event, data: { ...data, positions } };
    }
    return data.id !== undefined && ours.has(data.id) ? undefined : event;
  };
}
