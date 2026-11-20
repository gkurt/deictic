/**
 * Tailwind's panel: the element's classes as chips, a field to add more, and Save. Every change
 * previews on the page at once, on every element from the same place in the source, keeping the
 * classes the source adds at runtime; closing without saving puts the page back.
 *
 * What the project's Tailwind knows comes from the server half's routes. The field completes the word being
 * typed. A chip of a class Tailwind knows shows what it sets (a colour's swatch, a size's value) and opens the
 * classes of its kind to switch between, with a field for a value of one's own (`text-[13px]`). A class no file
 * used before has no CSS in the page's build until it's saved, so the preview brings its own, in a style of the
 * page's that goes as the panel does. The completions and a chip's kind open in boxes of their own beside the popup
 * (in the overlay's root, placed each frame), so the popup keeps its size and nothing in it moves. Without Tailwind v4 the chips are plain and nothing completes.
 */
import { defineClientPlugin } from '#src/index.ts';

import type { Alternatives, ClassInfo, Model, Op } from './index.ts';

const STYLE = `
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.chip { display: inline-flex; align-items: stretch; border: 1px solid var(--deictic-line); border-radius: 4px; font: 12px/20px ui-monospace, monospace; }
.chip.open { border-color: var(--deictic-accent); }
.chip .name { display: inline-flex; align-items: center; gap: 5px; padding: 0 2px 0 6px; border: 0; border-radius: 3px 0 0 3px; font: inherit; }
.chip button.name:hover { background: rgb(255 255 255 / 0.08); }
.chip .x { border: 0; padding: 0 5px; color: var(--deictic-muted); }
.chip .x:hover { color: var(--deictic-problem); }
/* A colour over a checker, so one that's part clear shows it. */
.swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.25);
  background: linear-gradient(var(--c), var(--c)), repeating-conic-gradient(#71717a 0 25%, #d4d4d8 0 50%) 0 0 / 6px 6px;
}
.hint { color: var(--deictic-muted); }
/* Beside the popup, not in it: in its flow they'd resize it under the pointer with every word and click. */
.editor, .suggest {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483647;
  box-sizing: border-box;
  border: 1px solid var(--deictic-line);
  border-radius: 6px;
  font: 13px/1.4 system-ui, sans-serif;
  color: var(--deictic-fg);
  background: var(--deictic-bg);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
}
.editor[hidden], .suggest[hidden] { display: none; }
.editor .top { display: flex; align-items: center; gap: 4px; padding: 2px 2px 2px 8px; font: 12px ui-monospace, monospace; color: var(--deictic-muted); }
.editor .top button:first-of-type { margin-left: auto; }
.editor .top .more { padding: 0 6px; font: 12px/18px system-ui, sans-serif; }
.editor .top .more[aria-expanded='true'] { border-color: var(--deictic-accent); color: var(--deictic-fg); }
.custom[hidden] { display: none; }
.alts { position: relative; display: flex; flex-wrap: wrap; gap: 4px; max-height: 190px; padding: 2px 8px 8px; overflow: auto; }
.alts button { display: inline-flex; align-items: center; gap: 5px; padding: 0 6px; font: 12px/20px ui-monospace, monospace; }
.alts button[aria-pressed='true'] { border-color: var(--deictic-accent); color: var(--deictic-accent); }
.alts .family { display: flex; gap: 2px; flex-basis: 100%; }
.alts .family button { padding: 0; border: 0; border-radius: 3px; }
.alts .family .swatch { width: 18px; height: 18px; border-radius: 3px; }
.alts .family button[aria-pressed='true'] { outline: 2px solid var(--deictic-fg); outline-offset: 1px; }
.custom { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-top: 1px solid var(--deictic-line); }
.custom input[type='color'] { flex: none; width: 28px; height: 24px; padding: 1px; cursor: pointer; }
.custom input[aria-invalid='true'] { border-color: var(--deictic-problem); }
.suggest { max-height: 168px; overflow: auto; }
.option { display: flex; align-items: center; gap: 6px; padding: 1px 6px; font: 12px/20px ui-monospace, monospace; cursor: pointer; }
.option[aria-selected='true'] { background: rgb(255 255 255 / 0.1); }
.option .hint { margin-left: auto; }
.row { display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end; align-items: center; }
.rest { margin-top: 6px; color: var(--deictic-muted); font-size: 12px; }
`;

const split = (list: string) => list.split(/\s+/).filter(Boolean);
/** The family a shade is of: `bg-red` for `bg-red-500`. */
const familyOf = (name: string) => /^(.*)-\d+(\/[^/]*)?!?$/.exec(name)?.[1];

function make<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string, text?: string): HTMLElementTagNameMap[Tag] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  if (el instanceof HTMLButtonElement) el.type = 'button';
  return el;
}

function swatch(color: string): HTMLElement {
  const el = make('span', 'swatch');
  // A custom property takes any text, and one that isn't a colour draws nothing.
  el.style.setProperty('--c', color);
  return el;
}

/** A class as it reads everywhere: its colour, its name, and what it sets where the name doesn't say. */
function face(into: HTMLElement, info: ClassInfo) {
  if (info.color !== undefined) into.append(swatch(info.color));
  into.append(info.name);
  const { value } = info;
  if (info.color !== undefined || value === undefined || value.length > 18 || value.includes('var(') || info.name.endsWith(value)) return;
  into.append(make('span', 'hint', value));
}

export default defineClientPlugin<Model, Op>({
  name: 'tailwind',
  label: 'Tailwind',
  mount(panel, context) {
    const style = document.createElement('style');
    style.textContent = STYLE;
    panel.append(style);

    const { model } = context;
    if (!model.editable) {
      const note = document.createElement('p');
      note.textContent = 'These classes are built at runtime, so there is no one list to edit:';
      const code = document.createElement('code');
      code.textContent = model.source;
      panel.append(note, code);
      return () => {};
    }

    // What the page rendered, to put back over a preview that wasn't saved.
    const originals = context.elements.map((el) => el.getAttribute('class'));
    let saved = split(model.classes);
    let draft = [...saved];
    // What the page has beyond the source's list: classes the helper's other arguments added, per element. Read
    // only for a helper, as the page may not have caught up with the source yet (just after an undo).
    const runtime = context.elements.map((el) =>
      model.rest === undefined ? [] : split(el.getAttribute('class') ?? '').filter((c) => !saved.includes(c)),
    );
    const unsaved = () => draft.join(' ') !== saved.join(' ');
    let previewed = false;
    let gone = false;

    // The server's answer, or nothing where it has none: the panel works without, only plainer.
    const ask = async <T>(route: string, init?: RequestInit): Promise<T | undefined> => {
      try {
        const res = await context.request(route, init);
        return res.ok ? ((await res.json()) as T) : undefined;
      } catch {
        return undefined;
      }
    };
    const naming = (classes: string[]): RequestInit => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ classes }),
    });
    /** What Tailwind says of each class seen so far. */
    const known = new Map<string, ClassInfo>();
    /** Set once the server says it has no Tailwind to ask. */
    let plain = false;

    const chips = make('div', 'chips');
    const editor = make('div', 'editor');
    editor.hidden = true;
    const input = document.createElement('input');
    input.placeholder = 'Add classes, Enter to add';
    input.spellcheck = false;
    input.autocomplete = 'off';
    const list = make('div', 'suggest');
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    const save = make('button', 'primary', 'Save');
    const row = make('div', 'row');
    row.append(save);
    panel.append(chips, input, row);
    // The root the panel is in, where its styles are: the overlay's, or its own where the popup is pinned in a page.
    const around = panel.getRootNode();
    const root = around instanceof ShadowRoot ? around : context.root;
    root.append(editor, list);

    /** The chip whose kind is open in the editor, by its place in the draft. */
    let editing: number | undefined;
    // Each box under what it's about (over it where there's no room under), as wide as the field, and kept there
    // every frame: the popup follows its element and can be dragged, and a chip is drawn again with every change.
    const floats: [box: HTMLElement, by: () => Element | undefined][] = [
      [editor, () => (editing === undefined ? undefined : chips.children[editing])],
      [list, () => input],
    ];
    const place = () => {
      for (const [box, by] of floats) {
        if (box.hidden !== false) continue;
        const anchor = by();
        if (anchor === undefined) continue;
        const at = anchor.getBoundingClientRect();
        const span = input.getBoundingClientRect();
        const height = box.offsetHeight;
        const below = window.innerHeight - at.bottom;
        const top = height + 12 > below && at.top > below ? at.top - height - 4 : at.bottom + 4;
        const place = `${Math.round(span.left)}px ${Math.round(top)}px`;
        if (box.style.translate !== place) box.style.translate = place;
        const width = `${Math.round(span.width)}px`;
        if (box.style.width !== width) box.style.width = width;
      }
    };
    let following = requestAnimationFrame(function follow() {
      following = requestAnimationFrame(follow);
      place();
    });
    if (model.rest !== undefined) panel.append(make('div', 'rest', `Also added at runtime: ${model.rest}`));

    // The classes the page's build had as the panel opened: any other may have no CSS there yet.
    const built = new Set(saved);
    let sheet: HTMLStyleElement | undefined;
    let styled = '';
    const lend = async () => {
      const fresh = draft.filter((c) => !built.has(c));
      const key = fresh.join(' ');
      if (plain || key === styled) return;
      styled = key;
      const answer = fresh.length === 0 ? { css: '' } : await ask<{ css: string }>('css', naming(fresh));
      if (answer === undefined || key !== styled || gone) return;
      sheet ??= document.head.appendChild(document.createElement('style'));
      sheet.textContent = answer.css;
    };

    const preview = () => {
      save.disabled = !unsaved();
      context.unsaved(unsaved() ? save : undefined);
      if (!unsaved() && !previewed) return;
      context.elements.forEach((el, i) => el.setAttribute('class', [...draft, ...runtime[i]!].join(' ')));
      previewed = true;
      void lend();
    };

    let opened = 0;
    const drawChips = () => {
      chips.replaceChildren(
        ...draft.map((c, i) => {
          const chip = make('span', i === editing ? 'chip open' : 'chip');
          const info = known.get(c);
          const name = make(info?.known === true ? 'button' : 'span', 'name');
          face(name, info ?? { name: c, known: false });
          if (name instanceof HTMLButtonElement) {
            name.title = `Change ${c}`;
            name.addEventListener('click', () => void (editing === i ? shut() : edit(i)));
          }
          const remove = make('button', 'x', '×');
          remove.title = `Remove ${c}`;
          remove.addEventListener('click', () => {
            shut();
            draft = draft.toSpliced(i, 1);
            render();
          });
          chip.append(name, remove);
          return chip;
        }),
      );
    };
    const describe = async () => {
      const missing = draft.filter((c) => !known.has(c));
      if (plain || missing.length === 0) return;
      const answer = await ask<{ available: boolean; items: ClassInfo[] }>('info', naming(missing));
      if (answer === undefined) return;
      plain = !answer.available;
      for (const item of answer.items) known.set(item.name, item);
      if (answer.items.length > 0) drawChips();
    };
    const render = () => {
      drawChips();
      preview();
      void describe();
    };

    const shut = (focus = true) => {
      opened++;
      if (editing === undefined) return;
      editing = undefined;
      editor.hidden = true;
      editor.removeAttribute('data-deictic-modal');
      editor.replaceChildren();
      drawChips();
      if (focus) input.focus();
    };
    // A press anywhere else in the overlay closes the editor, as it would a menu. The chips open and close it themselves.
    const onPress = (e: Event) => {
      const path = e.composedPath();
      if (!path.includes(editor) && !path.includes(chips)) shut(false);
    };
    root.addEventListener('pointerdown', onPress, true);
    /** Puts `name` where the open chip's class is. The same class twice would be one, so that's left. */
    const swap = (name: string, info: ClassInfo) => {
      if (editing === undefined || draft.includes(name)) return;
      known.set(name, info);
      draft = draft.with(editing, name);
      render();
    };
    const edit = async (at: number) => {
      const turn = ++opened;
      const was = draft[at]!;
      const found = await ask<Alternatives | null>(`alternatives?${new URLSearchParams({ class: was })}`);
      if (turn !== opened || draft[at] !== was || found === undefined || found === null) return;
      editing = at;
      drawChips();

      const top = make('div', 'top', found.label);
      const close = make('button', 'icon', '×');
      close.title = 'Close';
      close.addEventListener('click', () => shut());
      top.append(close);

      const alts = make('div', 'alts');
      const buttons = new Map<string, HTMLButtonElement>();
      const press = () => {
        for (const [name, button] of buttons) button.setAttribute('aria-pressed', String(name === draft[at]));
      };
      const choice = (item: ClassInfo, bare: boolean) => {
        const button = make('button', '');
        if (bare && item.color !== undefined) {
          button.append(swatch(item.color));
          button.title = item.name;
        } else {
          face(button, item);
        }
        button.addEventListener('click', () => {
          swap(item.name, item);
          press();
        });
        buttons.set(item.name, button);
        return button;
      };
      // A colour's shades in a row, a family under a family; whatever has no shades (`black`, `inherit`) comes first, named.
      const families = new Map<string, HTMLElement>();
      const loose: HTMLElement[] = [];
      for (const item of found.items) {
        const family = found.colors && item.color !== undefined ? familyOf(item.name) : undefined;
        if (family === undefined) {
          loose.push(choice(item, false));
          continue;
        }
        const shades = families.get(family) ?? make('div', 'family');
        families.set(family, shades);
        shades.append(choice(item, true));
      }
      alts.append(...loose, ...families.values());
      press();

      editor.replaceChildren(top, alts);
      const { custom } = found;
      if (custom !== undefined) {
        const form = make('form', 'custom');
        const field = document.createElement('input');
        field.placeholder = found.colors ? 'A colour of your own: #12b358' : `A value of your own${hinted(known.get(was))}`;
        field.spellcheck = false;
        field.value = custom.value?.replaceAll('_', ' ') ?? '';
        const named = (value: string) => `${custom.before}${value.trim().replace(/\s+/g, '_')}${custom.after}`;
        if (found.colors) {
          const picker = document.createElement('input');
          picker.type = 'color';
          picker.title = 'Pick a colour';
          if (/^#[\da-f]{6}$/i.test(field.value)) picker.value = field.value;
          // Each colour tried shows on the page as it's picked: a hex is a colour to Tailwind, with nothing to check.
          picker.addEventListener('input', () => {
            field.value = picker.value;
            field.removeAttribute('aria-invalid');
            swap(named(picker.value), { name: named(picker.value), known: true, color: picker.value, value: picker.value });
            press();
          });
          form.append(picker);
        }
        const set = make('button', '', 'Set');
        set.type = 'submit';
        field.addEventListener('input', () => field.removeAttribute('aria-invalid'));
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (field.value.trim() === '') return;
          const name = named(field.value);
          void ask<{ items: ClassInfo[] }>('info', naming([name])).then((answer) => {
            const info = answer?.items[0];
            if (turn !== opened || editing !== at) return;
            if (info?.known !== true) {
              field.setAttribute('aria-invalid', 'true');
              field.title = `Tailwind makes nothing of ${name}`;
              return;
            }
            swap(name, info);
            // Its kind may be another now (`text-[red]` is a colour), and the list has it to show as chosen.
            void edit(at);
          });
        });
        form.append(field, set);
        // Shown on asking, or where the class already has a value of its own to show.
        let asked = custom.value !== undefined;
        const more = make('button', 'more', 'Custom');
        more.title = 'Set a value of your own';
        const show = () => {
          form.hidden = !asked;
          more.setAttribute('aria-expanded', String(asked));
        };
        show();
        more.addEventListener('click', () => {
          asked = !asked;
          show();
          if (asked) field.focus();
        });
        close.before(more);
        editor.append(form);
      }
      // Esc closes the editor, not the popup, and reaches it only from inside: so the focus goes in.
      editor.setAttribute('data-deictic-modal', '');
      editor.hidden = false;
      // Placed as it shows, not a frame later, when it would flash where it was.
      place();
      const chosen = buttons.get(draft[at]);
      if (chosen !== undefined) alts.scrollTop = chosen.offsetTop - alts.clientHeight / 2;
      (chosen ?? editor.querySelector('button'))?.focus();
    };
    editor.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      shut();
    });

    const commit = async () => {
      const next = await context.apply({ classes: draft.join(' ') });
      if (next.editable) saved = split(next.classes);
      draft = [...saved];
      previewed = false;
      shut();
      render();
    };

    /** What completes the word being typed, and the one Enter takes. */
    let options: ClassInfo[] = [];
    let active = 0;
    let typed = 0;
    const drawOptions = () => {
      list.hidden = options.length === 0;
      // While it's open, Esc closes it and not the popup.
      list.toggleAttribute('data-deictic-modal', options.length > 0);
      list.replaceChildren(
        ...options.map((item, i) => {
          const option = make('div', 'option');
          option.setAttribute('role', 'option');
          option.setAttribute('aria-selected', String(i === active));
          face(option, item);
          option.addEventListener('click', () => take(item));
          return option;
        }),
      );
      place();
      const shown = list.children[active];
      if (!(shown instanceof HTMLElement)) return;
      if (shown.offsetTop < list.scrollTop) list.scrollTop = shown.offsetTop;
      else if (shown.offsetTop + shown.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = shown.offsetTop + shown.offsetHeight - list.clientHeight;
    };
    const hide = () => {
      typed++;
      options = [];
      drawOptions();
    };
    const suggest = async () => {
      const turn = ++typed;
      const word = /\S*$/.exec(input.value)![0];
      if (plain || word === '') return hide();
      const answer = await ask<{ items: ClassInfo[] }>(`complete?${new URLSearchParams({ q: word })}`);
      if (turn !== typed) return;
      options = (answer?.items ?? []).filter((item) => !draft.includes(item.name));
      active = 0;
      drawOptions();
    };
    /** Adds what the field holds. False when it held nothing new. */
    const add = () => {
      const added = split(input.value).filter((c) => !draft.includes(c));
      input.value = '';
      hide();
      if (added.length === 0) return false;
      draft = [...draft, ...added];
      render();
      return true;
    };
    const take = (item: ClassInfo) => {
      input.value = input.value.replace(/\S*$/, item.name);
      input.focus();
      // A variant is the start of a class: the rest is still to type.
      if (item.variant === true) {
        void suggest();
        return;
      }
      known.set(item.name, item);
      add();
    };

    input.addEventListener('input', () => void suggest());
    // A press in the list mustn't take the focus from the field, which would close the list under it.
    list.addEventListener('mousedown', (e) => e.preventDefault());
    input.addEventListener('blur', hide);
    input.addEventListener('keydown', (e) => {
      if (options.length > 0) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          active = (active + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
          drawOptions();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          take(options[active]!);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          hide();
          return;
        }
      }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!add()) void commit().catch(() => {});
    });
    save.addEventListener('click', () => void commit().catch(() => {}));
    render();
    input.focus();

    // A saved list reaches the page through the bundler's update, which this mustn't race.
    return () => {
      gone = true;
      sheet?.remove();
      cancelAnimationFrame(following);
      root.removeEventListener('pointerdown', onPress, true);
      editor.remove();
      list.remove();
      if (!unsaved()) return;
      context.elements.forEach((el, i) => {
        const was = originals[i];
        if (was === null || was === undefined) el.removeAttribute('class');
        else el.setAttribute('class', was);
      });
    };
  },
});

/** What a field for a value of one's own shows as the kind of thing to type: the class's value now. */
function hinted(info: ClassInfo | undefined): string {
  const value = info?.value;
  return value === undefined || value.length > 18 || value.includes('var(') ? '' : `: ${value}`;
}
