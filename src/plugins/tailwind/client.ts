/**
 * Tailwind's panel: the element's classes as chips, a field to add more, and Save. Every change
 * previews on the page at once, on every element from the same place in the source, keeping the
 * classes the source adds at runtime; closing without saving puts the page back. A class no file used
 * before has no CSS until Tailwind sees it on disk, so it shows only once saved.
 */
import { defineClientPlugin } from '#src/index.ts';

import type { Model, Op } from './index.ts';

const STYLE = `
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.chip { display: inline-flex; align-items: center; gap: 2px; padding: 0 2px 0 6px; border: 1px solid var(--deictic-line); border-radius: 4px; font: 12px/20px ui-monospace, monospace; }
.chip button { border: 0; padding: 0 4px; color: var(--deictic-muted); }
.chip button:hover { color: var(--deictic-problem); }
.row { display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end; align-items: center; }
.rest { margin-top: 6px; color: var(--deictic-muted); font-size: 12px; }
`;

const split = (list: string) => list.split(/\s+/).filter(Boolean);

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

    const chips = document.createElement('div');
    chips.className = 'chips';
    const input = document.createElement('input');
    input.placeholder = 'Add classes, Enter to add';
    input.spellcheck = false;
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'primary';
    save.textContent = 'Save';
    const row = document.createElement('div');
    row.className = 'row';
    row.append(save);
    panel.append(chips, input, row);
    if (model.rest !== undefined) {
      const rest = document.createElement('div');
      rest.className = 'rest';
      rest.textContent = `Also added at runtime: ${model.rest}`;
      panel.append(rest);
    }

    const preview = () => {
      save.disabled = !unsaved();
      if (!unsaved() && !previewed) return;
      context.elements.forEach((el, i) => el.setAttribute('class', [...draft, ...runtime[i]!].join(' ')));
      previewed = true;
    };
    const render = () => {
      chips.replaceChildren(
        ...draft.map((c, i) => {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = c;
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = '×';
          remove.title = `Remove ${c}`;
          remove.addEventListener('click', () => {
            draft = draft.toSpliced(i, 1);
            render();
          });
          chip.append(remove);
          return chip;
        }),
      );
      preview();
    };
    const commit = async () => {
      const next = await context.apply({ classes: draft.join(' ') });
      if (next.editable) saved = split(next.classes);
      draft = [...saved];
      previewed = false;
      render();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const added = split(input.value).filter((c) => !draft.includes(c));
      input.value = '';
      if (added.length > 0) {
        draft = [...draft, ...added];
        render();
        return;
      }
      void commit().catch(() => {});
    });
    save.addEventListener('click', () => void commit().catch(() => {}));
    render();
    input.focus();

    // A saved list reaches the page through the bundler's update, which this mustn't race.
    return () => {
      if (!unsaved()) return;
      context.elements.forEach((el, i) => {
        const was = originals[i];
        if (was === null || was === undefined) el.removeAttribute('class');
        else el.setAttribute('class', was);
      });
    };
  },
});
