/**
 * The custom event's tag the marks go in: the page's annotations, as an SVG in page coordinates (`svg`),
 * and as the annotations themselves (`annotations`, absent from recordings made before it was added).
 */
export const MARKS = 'deictic.annotations';

/**
 * The custom event for the page's address changing with no load, as a router does it (`href`, the new one): rrweb
 * records what the route drew, not that the address changed. A page that loads has rrweb's own `Meta` instead.
 */
export const PAGE = 'deictic.page';

/**
 * The custom event a recording ends with: rrweb's timeline lasts as long as its events, so without it a
 * recording of a still page (a voice-over, say) would replay as a moment, and its voice never play.
 */
export const END = 'deictic.end';

/**
 * The custom event for React's commits, where the react plugin is loaded and they're asked for (the recording's React
 * button): a `Commit` each (`deictic/react`'s), and `{ on }` where the recording starts and stops having them, so a
 * stretch without them isn't read as one where nothing rendered.
 */
export const REACT = 'deictic.react';
