/**
 * The custom event's tag the marks go in: the page's annotations, as an SVG in page coordinates (`svg`),
 * and as the annotations themselves (`annotations`, absent from recordings made before it was added).
 */
export const MARKS = 'deictic.annotations';

/**
 * The custom event a recording ends with: rrweb's timeline lasts as long as its events, so without it a
 * recording of a still page (a voice-over, say) would replay as a moment, and its voice never play.
 */
export const END = 'deictic.end';
