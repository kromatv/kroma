import type { TextDirection } from '@kromatv/i18n';
import { createContext, type ReactNode, use } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';

/** The way the layout runs under it: the app's root states its language's, and
 *  a `<Box dir>` its own. Left to right where nothing says otherwise, as
 *  react-native-web assumes too. */
export const DirectionContext = createContext<TextDirection>('ltr');

/** Which way the layout runs here, for the few values a component computes
 *  rather than lays out: the sign of a slide, a swipe, an offset. Start and end
 *  already follow it, so a laid-out side never needs it. */
export function useDirection(): TextDirection {
  return use(DirectionContext);
}

/** `distance` along the x axis towards the end of the line: to the right left
 *  to right, to the left right to left. For a slide a transform computes. */
export function useTowardsEnd(distance: number): number {
  return useDirection() === 'rtl' ? -distance : distance;
}

const DIRECTED: Readonly<Record<TextDirection, ViewStyle>> = StyleSheet.create({
  ltr: { direction: 'ltr' },
  rtl: { direction: 'rtl' },
});

/** The style that turns a native view's layout one way; a browser reads the
 *  host's `dir` attribute for the same. Null without a direction. */
export function directionStyle(dir: TextDirection | undefined): ViewStyle | null {
  return dir ? DIRECTED[dir] : null;
}

/** `node`, told which way it runs when `dir` says so. */
export function inDirection(dir: TextDirection | undefined, node: ReactNode): ReactNode {
  return dir ? <DirectionContext value={dir}>{node}</DirectionContext> : node;
}
