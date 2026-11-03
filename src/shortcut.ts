/**
 * A gesture: the keys held to outline the element under the pointer, and the button that, with them
 * held, opens the popup there. deictic's own (`MASTER` by default) opens the tab used last; a
 * plugin's, which it takes as its `shortcut` option and has none by default, opens its tab. The
 * bundler's plugin checks them all as it starts, so a wrong one, or two alike, fails the dev server,
 * not the page. Both halves import it: it must
 * stay dependency-free.
 */

/** A modifier key, as `KeyboardEvent.key` names it. */
export type Modifier = 'Alt' | 'Control' | 'Meta' | 'Shift';

export interface Shortcut {
  /** Held, and no other, to outline elements. */
  modifiers?: Modifier[];
  /** Pressed with them to open the panel. `'left'` unset. */
  button?: 'left' | 'middle' | 'right';
}

const FLAGS = { Alt: 'altKey', Control: 'ctrlKey', Meta: 'metaKey', Shift: 'shiftKey' } as const;
const BUTTONS = { left: 0, middle: 1, right: 2 } as const;

/** deictic's own shortcut, unless `deictic({ shortcut })` names another or `false`. */
export const MASTER: Required<Shortcut> = { modifiers: ['Alt'], button: 'left' };

/** The name deictic's own shortcut goes by in a problem. */
export const OWN = 'deictic';

/** deictic's own shortcut as given, with its default, before it's checked. */
export const ownShortcut = (given: Shortcut | false | undefined) => (given === false ? undefined : (given ?? MASTER));

/** The shortcut with its button's default and its modifiers in one order, or an error saying what to write instead. */
export function checkShortcut(plugin: string, shortcut: Shortcut): Required<Shortcut> {
  const { modifiers = [], button = 'left' } = shortcut;
  const named = Object.keys(FLAGS).join("', '");
  if (!Array.isArray(modifiers) || modifiers.length === 0) {
    throw new Error(
      `deictic: ${plugin}'s shortcut.modifiers is empty: hold at least one of '${named}', or every click would open the popup`,
    );
  }
  for (const m of modifiers)
    if (!Object.hasOwn(FLAGS, m)) throw new Error(`deictic: ${plugin}'s shortcut.modifiers has '${m}': name one of '${named}'`);

  if (!Object.hasOwn(BUTTONS, button))
    throw new Error(`deictic: ${plugin}'s shortcut.button is '${button}': name one of '${Object.keys(BUTTONS).join("', '")}'`);

  const order = Object.keys(FLAGS);
  return { modifiers: [...new Set(modifiers)].toSorted((a, b) => order.indexOf(a) - order.indexOf(b)), button };
}

/**
 * Each shortcut checked, in order, or nothing where there's none: none may be another's, or only the
 * first would ever open. deictic's own goes first, named `OWN`.
 */
export function checkShortcuts(plugins: readonly { name: string; shortcut?: Shortcut }[]): (Required<Shortcut> | undefined)[] {
  const taken = new Map<string, string>();
  return plugins.map(({ name, shortcut }) => {
    if (shortcut === undefined) return undefined;
    const checked = checkShortcut(name, shortcut);
    const key = nameOf(checked);
    const other = taken.get(key);
    if (other !== undefined) throw new Error(`deictic: ${name} and ${other} both open on ${key}: give one of them another \`shortcut\``);
    taken.set(key, name);
    return checked;
  });
}

/** How a shortcut reads, for a problem or a label: `Alt+Shift`, `Control+right-click`. */
export const nameOf = ({ modifiers = [], button = 'left' }: Shortcut) =>
  [...modifiers, ...(button === 'left' ? [] : [`${button}-click`])].join('+');

export interface Gesture {
  /** Whether exactly the shortcut's modifiers are down: AltGr, which is Control and Alt, isn't Alt. */
  held: (e: MouseEvent | KeyboardEvent) => boolean;
  /** The shortcut's button, as `MouseEvent.button` numbers it. */
  button: number;
}

export function gestureOf(shortcut: Required<Shortcut>): Gesture {
  const on = new Set<string>(shortcut.modifiers);
  const flags = Object.entries(FLAGS);
  return { held: (e) => flags.every(([key, flag]) => e[flag] === on.has(key)), button: BUTTONS[shortcut.button] };
}
