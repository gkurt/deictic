/**
 * Which element a task is about, where one place in the source renders several (a list's items, a `map`): the mark
 * alone finds the first of them, so a task keeps its place among them and its text, and is found again by those.
 */
import { ATTRIBUTE } from '#src/client/dom.ts';

import type { Task, Which } from './index.ts';

/** As much of an element's text as tells it from its siblings, and as a label holds. */
const SAID = 120;

const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, SAID);

/** Which of `alike` (the elements with its mark, in the page's order) `el` is; its text as `said` has it, which may be masked. */
export function whichOf(el: Element, alike: Element[], said: Element = el): Which {
  const text = textOf(said);
  return { nth: alike.indexOf(el) + 1, ...(text === '' ? {} : { text }) };
}

/**
 * The element a task is about on this page: the only one with its mark, or the one of several with its text, else the
 * one at its place among them. None where it was one of more than the page has now and its text is on none of them.
 */
export function elementOf(task: Pick<Task, 'which'> & { place?: string }): Element | null {
  if (task.place === undefined) return null;
  const alike = [...document.querySelectorAll(`[${ATTRIBUTE}="${CSS.escape(task.place)}"]`)];
  const { which } = task;
  if (which === undefined || alike.length <= 1) return alike[0] ?? null;
  const at = alike[which.nth - 1];
  const said = which.text === undefined ? [] : alike.filter((el) => textOf(el) === which.text);
  // Text that's on several (`Learn more`) is told apart by the place among them, where that's one of them.
  if (said.length > 0) return at !== undefined && said.includes(at) ? at : said[0]!;
  return at ?? null;
}
