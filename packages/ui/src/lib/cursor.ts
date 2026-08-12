// What the pointer looks like over a control, on the browser targets.
//
// A browser gives a bare <button> no cursor of its own and react-native-web
// only paints one on the pressables it builds itself, so without these the kit
// draws the page's arrow over everything and the pointer changes shape only
// where something happens to state one. React Native's own `CursorValue` knows
// `auto` and `pointer` and nothing else, so both are stated as plain style.

import type { ViewStyle } from 'react-native';
import { motion } from '#ui/core/tokens';

/** A control the pointer can press. */
const HAND = { cursor: 'pointer' } as unknown as ViewStyle;

/** Stated rather than inherited: a face inside a group of controls, or a
 *  control that is disabled, would otherwise wear the group's hand. */
const ARROW = { cursor: 'default' } as unknown as ViewStyle;

export { ARROW, HAND };

/** How a control's colours travel between rest, hover and focus.
 *
 * Only the painted properties: the press scale is an `Animated` transform and
 * the focus ring is an outline, and both should land at once rather than ease.
 * A hover that snaps reads as a redraw; the same swap over `motion.duration.fast`
 * reads as the control answering the pointer. Web only, since that is where a
 * pointer is, and stated here because React Native has no transition of its own.
 */
const COLOUR_MOTION = {
  transitionProperty: 'background-color, border-color, color',
  transitionDuration: `${motion.duration.fast}ms`,
  transitionTimingFunction: `cubic-bezier(${motion.bezier.out.join(', ')})`,
} as unknown as ViewStyle;

export { COLOUR_MOTION };
