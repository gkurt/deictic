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

/** The custom event for a line of the page's console, or an error nothing caught: a `Logged` (`level`, `text`, `stack`). */
export const LOG = 'deictic.console';

/**
 * The custom event a recording ends with: rrweb's timeline lasts as long as its events, so without it a
 * recording of a still page (a voice-over, say) would replay as a moment, and its voice never play.
 */
export const END = 'deictic.end';
