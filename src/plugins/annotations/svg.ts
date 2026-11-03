/**
 * Annotations as SVG: the layer the page shows them in, and what a screenshot draws over itself. Shapes
 * only, no `foreignObject`, so a canvas that draws the SVG isn't tainted, and a browser rendering it
 * elsewhere needs nothing of the page.
 */
import type { Annotation, Area, Point } from './index.ts';

export const STROKE = 3;
export const FONT = 14;
const PAD = 6;

/** How wide text is, in CSS pixels: measured where there's a canvas, guessed where there isn't. */
export type Measure = (text: string) => number;

export const guess: Measure = (text) => text.length * FONT * 0.6;

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const n = (value: number) => Math.round(value * 10) / 10;

/** An arrow's path: its line, then its head, two strokes back from the tip either side of the line. */
function arrow(from: Point, to: Point): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const at = (p: Point) => `${n(p.x)},${n(p.y)}`;
  const side = (turn: number) => at({ x: to.x - 14 * Math.cos(angle + turn), y: to.y - 14 * Math.sin(angle + turn) });
  return `M${at(from)} L${at(to)} M${side(0.45)} L${at(to)} L${side(-0.45)}`;
}

function shapeOf({ shape, color }: Annotation, measure: Measure): string {
  const line = `fill="none" stroke="${escape(color)}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (shape.kind) {
    case 'box':
      return `<rect x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.width)}" height="${n(shape.height)}" rx="4" ${line}/>`;
    case 'arrow':
      return `<path d="${arrow(shape.from, shape.to)}" ${line}/>`;
    case 'pen':
      return `<polyline points="${shape.points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" ${line}/>`;
    case 'note': {
      const lines = shape.text.split('\n');
      const width = Math.max(...lines.map(measure)) + PAD * 2;
      const height = lines.length * FONT * 1.3 + PAD * 2;
      const text = lines
        .map(
          (l, i) => `<tspan x="${n(shape.at.x + PAD)}" y="${n(shape.at.y + PAD + FONT * (i + 1) * 1.3 - FONT * 0.3)}">${escape(l)}</tspan>`,
        )
        .join('');
      return (
        `<rect x="${n(shape.at.x)}" y="${n(shape.at.y)}" width="${n(width)}" height="${n(height)}" rx="4" fill="${escape(color)}"/>` +
        `<text font-family="system-ui, sans-serif" font-size="${FONT}" fill="#fff">${text}</text>`
      );
    }
  }
}

/**
 * The annotations over `area` of the viewport, the page scrolled by `scroll`: an SVG `area`'s size,
 * whose view is that part of the page.
 */
export function toSvg(annotations: readonly Annotation[], area: Area, scroll: Point, measure: Measure = guess): string {
  const view = `${n(area.x + scroll.x)} ${n(area.y + scroll.y)} ${n(area.width)} ${n(area.height)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(area.width)}" height="${n(area.height)}" viewBox="${view}">${annotations.map((a) => shapeOf(a, measure)).join('')}</svg>`;
}
