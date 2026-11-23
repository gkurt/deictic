/**
 * The Task tab: a composer to add a task about the element with (`composer.ts`). The tasks there already are the
 * drawer's to list and open (`drawer.ts`), and the pins' to show on the page. Beside the channel it says who watches
 * it (`Model.watching`), or that no agent does.
 * Enter or the arrow sends it with the page's URL, the viewport and the element as it rendered, which the source
 * can't tell: the chain of source it rendered through, its HTML (a file attached), and where the annotations plugin
 * is loaded, what's marked on the page. Record leaves the popup (`away`) to record the page, and comes back with
 * what was typed when it's stopped, wherever the page is by then.
 *
 * Its tool in the panel adds a task about a spot: picked, the next press on the page opens this tab on that point,
 * in the marked element under it or the nearest to it.
 */
import { componentOf, fiberOf, ownerOf } from '#src/client/component.ts';
import { sameAs, toolButton } from '#src/client/dom.ts';
import { defineClientPlugin, type Target } from '#src/index.ts';

import { type About, atOf, attachedOf, COMPOSER_STYLE, composerIn, type Draft, element, onPage, type Seen } from './composer.ts';
import { drawerOf } from './drawer.ts';
import type { Model, Op, TaskAdded } from './index.ts';
import { pinsIn } from './pins.ts';
import { storeOf } from './store.ts';
import { whichOf } from './which.ts';

const STYLE = `
.compose { flex: none; }
.row { display: flex; gap: 6px; margin-top: 8px; justify-content: space-between; align-items: center; }
/* Cut short: a channel's name and its watchers' may be long. */
.hint { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--deictic-muted); font-size: 12px; }
/* A dot as a task's state is: a ring while no one watches, green while someone does. */
.watch::before { content: ''; display: inline-block; box-sizing: border-box; width: 7px; height: 7px; margin-right: 4px; border-radius: 50%; border: 1.5px solid var(--deictic-muted); }
.watch.on::before { border-color: #4ade80; background: #4ade80; }
.hint a { color: inherit; }
.hint a:hover { color: var(--deictic-fg); }
${COMPOSER_STYLE}`;

const TOOL_STYLE = `
.task-tool button { position: relative; }
.task-tool .count {
  position: absolute;
  top: -5px;
  right: -5px;
  box-sizing: border-box;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 8px;
  font: 700 10px/15px system-ui, sans-serif;
  color: var(--deictic-on-accent);
  background: var(--deictic-accent);
}
.task-tool button[aria-pressed='true'] .count { color: var(--deictic-fg); background: #09090b; }
`;
/** A note with a plus: a task to add. */
const TASK = '<path d="M4 5h16v11H9l-5 4zM12 8v5M9.5 10.5h5"/>';

/** What the panel keeps while it's away recording: what's typed and asked for. What's attached is the tray's. */
interface Kept {
  text: string;
  /** Whether a shot was asked for, or asked not to be, where either was. */
  shot?: boolean;
  html: boolean;
  /** The page as the panel left, and its elements as that page had them: for a task added where the page has moved on. */
  page: string;
  viewport: Op['viewport'];
  about: { target: Target; own: boolean; seen: Seen }[];
}

/**
 * `#shadow-root > div.panel > div.head > button.tab:nth-of-type(2)`: where `inner` is inside `outer`, through
 * shadow roots, by tag, classes and, among siblings alike, place, for whoever finds it in the code.
 */
function pathTo(inner: Element, outer: Element): string {
  const steps: string[] = [];
  for (let at: Element | undefined = inner; at !== undefined && at !== outer;) {
    const nameOf = (el: Element) => `${el.localName}${[...el.classList].map((c) => `.${c}`).join('')}`;
    const name = nameOf(at);
    const siblings = at.parentElement === null ? [] : [...at.parentElement.children];
    // Its place only where a sibling reads the same.
    const same = siblings.filter((c) => nameOf(c) === name).length > 1;
    const alike = siblings.filter((c) => c.localName === at!.localName);
    steps.unshift(same ? `${name}:nth-of-type(${alike.indexOf(at) + 1})` : name);
    if (at.parentElement !== null) {
      at = at.parentElement;
    } else {
      const root = at.getRootNode();
      if (!(root instanceof ShadowRoot)) break;
      steps.unshift('#shadow-root');
      at = root.host;
    }
  }
  return steps.join(' > ');
}

const parentOf = (el: Element): Element | undefined => {
  if (el.parentElement !== null) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : undefined;
};

/** How many places a chain names after the element's own: who uses it, and who uses that. Further out is the app's shell. */
const CHAIN = 3;

/**
 * The source `el` rendered through, after its own place, nearest first: a shared component's own line is the same
 * wherever it's used, and the change is most often in what uses it, or in what uses that.
 *
 * With React in development, those are the components that wrote it, each the one whose JSX has the one before:
 * `Field (src/Field.tsx:20)`, its line the nearest element around `el` that the component wrote, or the name alone
 * for one with no element of its own around it (it wraps what it uses only in other components), which the marks
 * can't show at all. A layout component the element was only passed through isn't among them.
 *
 * Without (another framework, a production build) it's read off the marks around it, each a `file:line`: the
 * nearest element each next file wrote.
 */
function chainOf(el: Element, file: string): NonNullable<Op['chain']> {
  const found: NonNullable<Op['chain']> = [];
  const wrote = ownerOf(fiberOf(el));
  if (wrote !== undefined) {
    for (let owner = ownerOf(wrote); owner !== undefined && found.length < CHAIN; owner = ownerOf(owner)) {
      const name = componentOf(owner);
      let place: string | undefined;
      for (let at = parentOf(el); at !== undefined && place === undefined; at = parentOf(at)) {
        const by = ownerOf(fiberOf(at));
        // A component's fiber is one of two, by turns: an element may name either.
        if (by === undefined || (by !== owner && by !== owner.alternate)) continue;
        place = at.getAttribute('data-deictic')?.replace(/:\d+$/, '');
      }
      if (name !== undefined) found.push(place === undefined ? name : `${name} (${place})`);
      else if (place !== undefined) found.push(place);
    }
    if (found.length > 0) return found;
  }
  let last = file;
  for (let at = parentOf(el); at !== undefined && found.length < CHAIN; at = parentOf(at)) {
    const mark = at.getAttribute('data-deictic');
    if (mark === null) continue;
    const from = mark.replace(/:\d+:\d+$/, '');
    if (from === last) continue;
    last = from;
    found.push(mark.replace(/:\d+$/, ''));
  }
  return found;
}

/** What's sent of the element's HTML at most, in characters: the server attaches it as a file. */
const HTML = 100_000;

/** The event the page hears of each added task by, on `window`: its `detail` is a `TaskAdded`. */
export const TASK_ADDED = 'deictic:task';

/** Tells the page of a task just added: the newest of the element's tasks, as the board answered them. */
function announce(model: Model, op: Op, target: Target, shots: string[]): void {
  const task = model.tasks.at(-1);
  if (task === undefined) return;
  const detail: TaskAdded = {
    id: task.id,
    title: task.title,
    state: task.state,
    channel: model.channel,
    target,
    page: op.page,
    attached: {
      screenshots: op.screenshots?.length ?? 0,
      recordings: op.recordings?.length ?? 0,
      voice: op.voice?.length ?? 0,
      marks: (op.annotations?.count ?? 0) + (op.screenshots ?? []).reduce((n, shot) => n + (shot.marks?.count ?? 0), 0),
    },
    screenshots: shots,
  };
  window.dispatchEvent(new CustomEvent(TASK_ADDED, { detail }));
}

export default defineClientPlugin<Model, Op>({
  name: 'tasks',
  label: 'Task',
  // Its tool in the tool panel, after the others': what takes what they made. Picked, the next press on the page
  // opens the tab on that spot.
  setup: (context) => {
    const { tools, tray } = context;
    // The tasks there already, in the drawer.
    drawerOf(context);
    const group = element('div', { className: 'tool-group task-tool' });
    let picking = false;
    const button = toolButton(TASK, 'Task', 'T', () => {
      if (picking) return;
      picking = true;
      button.setAttribute('aria-pressed', 'true');
      void tools.pick().then((spot) => {
        picking = false;
        button.setAttribute('aria-pressed', 'false');
        if (spot !== undefined) context.open('tasks', spot.element, spot.at);
      });
    });
    button.setAttribute('aria-pressed', 'false');
    // How much is in the tray, for the task to take.
    const count = element('span', { className: 'count' });
    const counted = () => {
      const held = tray.list().length;
      count.textContent = String(held);
      count.hidden = held === 0;
    };
    tray.subscribe(counted);
    counted();
    button.append(count);
    group.append(element('style', { textContent: TOOL_STYLE }), button);
    // After the other tools that capture the page, as it takes what they made.
    tools.add(group, { section: 'capture', last: true });
  },
  // What the page before this left the tab for: a recording, where it carries on here.
  resume: ({ use }) => use('recordings')?.going(),
  // The page's tasks, where they are, while it's pointed on.
  pointing: (context) => pinsIn(context).glance(),
  mount: (panel, context) => {
    const style = element('style', { textContent: STYLE });
    const hint = element('span', { className: 'hint' });
    const row = element('div', { className: 'row' });
    row.append(hint);
    // The page's tasks, pinned where they are, while the tab is open too: not for a popup a page shows in place,
    // which is in a root of its own.
    const over = panel.getRootNode() === context.root;
    const unpin = over ? pinsIn(context).glance() : undefined;

    const shots = context.use('screenshots');
    const recorder = context.use('recordings');
    const back = context.resumed;
    // The server half's `html` option, which takes the button away; a page half with no options (a `standalone` server's) has it.
    const sendsHtml = (context.options as { html?: boolean } | undefined)?.html !== false;
    const own = (): About[] => [{ target: context.target, own: true, el: context.element }];

    /**
     * What the page says of an element: read now, while the page has it, and as the panel left it where the page
     * has moved on without it (a recording that went on to another), which is the page the task is about.
     */
    const seenOf = (a: About): Seen | undefined => {
      const el = onPage(a);
      if (el === undefined) return a.seen;
      const chain = chainOf(el, a.target.loc.file);
      const { pointed, at } = context;
      const masked = shots?.masked(el) ?? el;
      const alike = sameAs(el);
      return {
        // What was pointed at, and the spot, are the popup's own element's.
        ...(a.own && at !== undefined ? { point: at } : {}),
        ...(a.own && pointed !== undefined ? { pointed: { path: pathTo(pointed, el), html: pointed.outerHTML.slice(0, 4000) } } : {}),
        count: alike.length,
        ...(alike.length > 1 ? { which: whichOf(el, alike, masked) } : {}),
        ...(chain.length === 0 ? {} : { chain }),
        html: masked.outerHTML.slice(0, HTML),
      };
    };
    /** The page the task is about: this one, or the one the panel left where none of its elements is on this one. */
    const wherever = (about: About[]): Pick<Kept, 'page' | 'viewport'> => {
      if (back !== undefined && about.length > 0 && !about.some((a) => onPage(a) !== undefined)) {
        const { page, viewport } = back.state as Kept;
        return { page, viewport };
      }
      return { page: location.href, viewport: { width: innerWidth, height: innerHeight } };
    };

    // Record: the popup goes, the page is recorded, and it comes back with what's typed and the recording attached.
    const leave = async () => {
      if (recorder === undefined) return;
      composer.problem.textContent = '';
      if (recorder.recording()) {
        composer.problem.textContent = "A recording is going already: stop it in the tool panel, and it's attached here";
        return;
      }
      // A take going on is kept first, as a chip, to come back to with the rest.
      await composer.stopTake();
      const { text, shot, html, about } = composer.draft();
      const kept: Kept = {
        text,
        ...(shot === undefined ? {} : { shot }),
        html,
        ...wherever(about),
        about: about.flatMap(({ target, own: mine, ...a }) => {
          const seen = seenOf({ target, own: mine, ...a });
          return seen === undefined ? [] : [{ target, own: mine, seen }];
        }),
      };
      context.away(kept, () => recorder.record());
    };

    const composer = composerIn(context, {
      placeholder: 'What should change here?',
      sendLabel: 'Add task',
      about: own,
      html: sendsHtml,
      ...(context.at === undefined ? {} : { at: context.at }),
      shoot: true,
      // Back from a recording on a page without the element: nothing of it to shoot or draw on here.
      here: context.element.isConnected,
      over,
      record: () => void leave(),
      changed: () => mark(),
      submit: async (gathered) => {
        const { text, about, html: withHtml, screenshots } = gathered;
        // The first element is the task's place; the rest are named beside it; with none, it's the page's.
        const [first, ...rest] = about;
        const { html, ...said } = (first === undefined ? undefined : seenOf(first)) ?? { html: undefined, count: 0 };
        const htmlOf = (of: string | undefined) => (sendsHtml && withHtml && of !== undefined ? { html: of } : {});
        const op: Op = {
          text,
          ...wherever(about),
          ...said,
          ...(first === undefined ? { detached: true } : {}),
          ...htmlOf(html),
          ...(rest.length === 0 ? {} : { also: rest.map((a) => ({ at: atOf(a.target), tag: a.target.tag, ...htmlOf(seenOf(a)?.html) })) }),
          ...attachedOf(gathered),
        };
        // Sent on its first element, which may not be the popup's.
        const on = first?.target ?? context.target;
        let model: Model;
        try {
          model = await context.apply(op, on);
        } catch {
          // The panel's status says why; what was typed and attached stays, to send again.
          return false;
        }
        // In the drawer and on its pin at once: the tab lists none.
        storeOf(context).load(true);
        announce(
          model,
          op,
          on,
          (screenshots ?? []).map((shot) => shot.url),
        );
        const added = model.tasks.at(-1);
        composer.note.textContent =
          first === undefined
            ? 'Added, about the page: it is in the drawer'
            : `Added${added === undefined ? '' : ` #${added.id}`}: it is in the drawer`;
        if (added?.dropped !== undefined) {
          // Open, to say so: the task went without something that was attached.
          composer.problem.textContent = `Sent without ${added.dropped}: it wasn't kept any more`;
          return true;
        }
        // Its pin and the drawer have it now. Once the composer has emptied (the tray, the page's marks), which it does as this answers.
        setTimeout(context.close);
        return true;
      },
    });
    panel.append(style, composer.el);
    composer.el.append(row);

    /** Tells the popup what leaving now would lose: the words of a new task, or a take. What's attached is the tray's, and stays. */
    const mark = () => context.unsaved(composer.pending() ? composer.send : undefined);
    /** Where a task goes, and whether it's taken up: the channel, and who watches it, or that no one does, where that's known. */
    const render = ({ channel, link, watching }: Model) => {
      const name =
        link === undefined
          ? element('span')
          : element('a', { href: link, target: '_blank', rel: 'noreferrer', title: 'Open the channel on the board' });
      name.textContent = `#${channel}`;
      hint.replaceChildren('to ', name);
      if (watching === undefined) return;
      const names = new Intl.ListFormat('en', { type: 'conjunction' }).format(watching);
      const on = watching.length > 0;
      const who = element('span', {
        className: on ? 'watch on' : 'watch',
        textContent: on ? `${names} watching` : 'no agent watching',
        title: on
          ? `${names} ${watching.length === 1 ? 'is' : 'are'} watching #${channel}, and take${watching.length === 1 ? 's' : ''} each task as it's added`
          : `A task waits on the board until an agent watches #${channel}: ask yours to watch deictic's tasks`,
      });
      hint.append(' · ', who);
    };

    // Back from recording: what was typed and asked for, and why there's no recording, where there's none.
    if (back !== undefined) {
      const kept = back.state as Kept;
      // Each element where this page has it, and as the page that had it said it where not.
      const about = kept.about.map(({ target, own: mine, seen }) => {
        const el = mine ? context.element : (document.querySelector(`[data-deictic="${CSS.escape(atOf(target))}"]`) ?? undefined);
        return { target, own: mine, seen, ...(el === undefined ? {} : { el }) };
      });
      const draft: Draft = { text: kept.text, html: kept.html, about, ...(kept.shot === undefined ? {} : { shot: kept.shot }) };
      composer.restore(draft);
      if (back.problem !== undefined) composer.problem.textContent = back.problem;
    }

    render(context.model);
    composer.focus();
    return () => {
      unpin?.();
      composer.destroy();
    };
  },
});
