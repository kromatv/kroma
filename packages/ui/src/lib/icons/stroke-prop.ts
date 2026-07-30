// Which prop carries the outline weight, native. Tabler's React Native build
// takes `strokeWidth` (plain `stroke` is react-native-svg's stroke COLOUR)
// where the DOM build takes `stroke`; the wrong one draws at the default
// weight rather than failing.

const STROKE_PROP = 'strokeWidth';

export { STROKE_PROP };
