// <FocusScope>: the navigator for one screen, and the groups inside it.
//
// Every screen is wrapped in one by the router, and it does two things: it holds
// the spatial tree for that screen, and it makes sure exactly ONE navigator is
// listening to the remote at a time. A screen that is pushed over another stays
// mounted underneath, and two live navigators would both act on the same press.
//
// SHARED, on purpose. Only the screen root differs between the targets - the web
// must contribute no box, native needs a focusable key host and a `flex: 1` view
// - so only the root is forked, into focus-root.tsx / focus-root.web.tsx. This
// file used to be forked whole, which meant <FocusRegion> and <FocusColumn> had
// two homes with nothing linking them: a prop added to one compiled fine and
// silently gave the browser TVs different focus behaviour from the native ones,
// which is the class of bug the shared navigator was adopted to eliminate.

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SpatialNavigationView } from 'react-tv-space-navigation';
import { useFocusEntryScope } from './focus-entry';
import { FocusPresenceProvider } from './focus-presence';
import { useRemoteBridge } from './focus-remote';
import { FocusRoot } from './focus-root';
import { flat } from './nav-style';

interface FocusScopeProps {
  children: ReactNode;
  /** Applied to the screen's own box - which exists on native and not on the
   *  web, where the root deliberately renders no element. See focus-root. */
  style?: StyleProp<ViewStyle>;
}

interface ScreenScopeProps extends FocusScopeProps {
  /** Names the SCREEN inside a scope that outlives it. A scope holding
   *  persistent chrome (a nav bar that must keep its instance across a section
   *  change) cannot re-decide where focus opens from its own mount, because it
   *  does not remount; changing this key is how it hears about the arrival.
   *  Omit it for the usual case - one scope per screen, keyed by the router. */
  entryKey?: string | number;
}

interface FocusColumnProps extends FocusScopeProps {
  /** Treat the rows inside as a grid: keep the column when moving between them.
   *  See <FocusColumn>. */
  grid?: boolean;
}

function FocusScope({ children, style, entryKey }: Readonly<ScreenScopeProps>) {
  useRemoteBridge();
  // A fresh scope - or a new screen inside one that persists - decides where
  // focus opens again: see lib/focus-entry.
  useFocusEntryScope(entryKey);
  return (
    // The presence flag is what lets a kit control exist OUTSIDE any scope (a
    // phone screen, a plain web page) without registering with a navigator
    // that was never mounted. See lib/focus-presence.
    <FocusPresenceProvider value={true}>
      <FocusRoot style={style}>{children}</FocusRoot>
    </FocusPresenceProvider>
  );
}

/**
 * <FocusRegion>: a group of controls that belong together on one line.
 *
 * The navigator moves between GROUPS vertically and inside a group
 * horizontally, so this is how a row says it is a row: the nav bar, a hero's
 * buttons, a rail. Nothing measures anything - the shape comes from the tree,
 * which is why it cannot drift when a scroll view animates or when a control
 * mounts late.
 */
function FocusRegion({ children, style }: Readonly<FocusScopeProps>) {
  return (
    <SpatialNavigationView direction="horizontal" style={flat(style)}>
      {children}
    </SpatialNavigationView>
  );
}

/**
 * <FocusColumn>: a group of controls stacked one above the other.
 *
 * The mirror of <FocusRegion>, for a block that owns its own vertical order
 * inside a screen: a list of servers, an on-screen keyboard.
 *
 * `grid` is what makes a stack of <FocusRegion> rows behave like a GRID, and it
 * is the difference between an on-screen keyboard that works and one that does
 * not. Moving between rows, the navigator lands on the row's last-focused key -
 * so Down from T went to A, and every vertical press read as a diagonal. With
 * `grid` the navigator keeps the POSITION instead: Down from the fifth key of a
 * row lands on the fifth key of the next one.
 */
function FocusColumn({ children, style, grid = false }: Readonly<FocusColumnProps>) {
  return (
    <SpatialNavigationView direction="vertical" alignInGrid={grid} style={flat(style)}>
      {children}
    </SpatialNavigationView>
  );
}

export type { FocusColumnProps, FocusScopeProps, ScreenScopeProps };
export { FocusColumn, FocusRegion, FocusScope };
