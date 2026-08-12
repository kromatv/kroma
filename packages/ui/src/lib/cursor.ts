// What the pointer looks like over a control, on the browser targets.
//
// A browser gives a bare <button> no cursor of its own and react-native-web
// only paints one on the pressables it builds itself, so without these the kit
// draws the page's arrow over everything and the pointer changes shape only
// where something happens to state one. React Native's own `CursorValue` knows
// `auto` and `pointer` and nothing else, so both are stated as plain style.

import type { ViewStyle } from 'react-native';

/** A control the pointer can press. */
const HAND = { cursor: 'pointer' } as unknown as ViewStyle;

/** Stated rather than inherited: a face inside a group of controls, or a
 *  control that is disabled, would otherwise wear the group's hand. */
const ARROW = { cursor: 'default' } as unknown as ViewStyle;

export { ARROW, HAND };
