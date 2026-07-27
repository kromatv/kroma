// Which prop carries the outline WEIGHT, native (Apple TV, Android TV, phones).
//
// The two Tabler packages agree on `size` and `color` but not on this one name:
// the React Native build takes `strokeWidth` (its props extend react-native-svg's
// SvgProps, where plain `stroke` is the stroke's COLOUR), while the DOM build
// takes `stroke` and applies it as the width. Passing the wrong one is quietly
// wrong rather than loud - the icon still draws, at the default weight - so the
// difference is named here instead of guessed at the call site.

const STROKE_PROP = 'strokeWidth';

export { STROKE_PROP };
