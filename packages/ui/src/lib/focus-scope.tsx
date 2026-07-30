// <FocusScope>: the navigator for one screen, and the groups inside it.
// Exactly one navigator answers the remote at a time; shared between web and
// native on purpose so behaviour can't drift between them (only the screen
// root is forked, into focus-root.tsx / focus-root.web.tsx).

import { type ReactNode, useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SpatialNavigationView, useLockSpatialNavigation } from 'react-tv-space-navigation';
import { useFocusEntryScope } from './focus-entry';
import { FocusPresenceProvider } from './focus-presence';
import { useRemoteBridge } from './focus-remote';
import { FocusRoot } from './focus-root';
import { flat } from './nav-style';

interface FocusScopeProps {
  children: ReactNode;
  /** Applied to the screen's own box; the web root renders no element (see focus-root). */
  style?: StyleProp<ViewStyle>;
}

interface ScreenScopeProps extends FocusScopeProps {
  /** Names the SCREEN inside a scope that outlives it (e.g. persistent nav
   *  chrome), so it re-decides where focus opens on each arrival instead of on
   *  its own mount. Omit for the usual case: one scope per screen. */
  entryKey?: string | number;
  /**
   * Mount a remote bridge for this scope. Default true; only a scope drawn
   * INSIDE another one passes `false` — the bridge fans events to every
   * registered navigator, so a nested one would double-fire each press. An
   * `<OverlayHost>` dialog reuses the screen's bridge; a `<Modal>`-backed one
   * is in its own view controller and needs its own.
   */
  bridge?: boolean;
}

interface FocusColumnProps extends FocusScopeProps {
  grid?: boolean;
}

/**
 * Also what a DIALOG mounts, over the screen that opened it, paired with
 * {@link useLockFocusBehind} on the screen: that locks the screen's navigator
 * out of the remote, leaving this root the only one listening. Its
 * `useFocusEntryScope` runs during render (not an effect) so the dialog's
 * `autoFocus` claims the ring before the screen underneath decides; on the
 * browser targets it also resets device-type to remote-keys mode regardless
 * of where the pointer was left.
 */
function FocusScope({ children, style, entryKey, bridge = true }: Readonly<ScreenScopeProps>) {
  // Hooks cannot be conditional, so the flag is read INSIDE the bridge rather
  // than around it.
  useRemoteBridge(bridge);
  useFocusEntryScope(entryKey);
  return (
    // Lets a kit control exist OUTSIDE any scope (a phone screen, a plain web
    // page) without registering with a navigator that was never mounted.
    <FocusPresenceProvider value={true}>
      <FocusRoot style={style}>{children}</FocusRoot>
    </FocusPresenceProvider>
  );
}

/**
 * Locks the navigator this component sits in out of the remote while `active`.
 * Called from OUTSIDE the scope it protects, so it locks the screen rather
 * than the dialog opened over it.
 */
function useLockFocusBehind(active: boolean): void {
  const { lock, unlock } = useLockSpatialNavigation();
  useEffect(() => {
    if (!active) return;
    lock();
    // The navigator counts locks rather than holding a flag, so overlapping
    // surfaces (a picker opened from a dialog) unlock in any order.
    return unlock;
  }, [active, lock, unlock]);
}

/**
 * A group of controls that belong together on one line — the nav bar, a
 * hero's buttons, a rail. The navigator moves between groups vertically and
 * inside a group horizontally; nothing measures anything, the shape comes
 * from the tree.
 */
function FocusRegion({ children, style }: Readonly<FocusScopeProps>) {
  return (
    <SpatialNavigationView direction="horizontal" style={flat(style)}>
      {children}
    </SpatialNavigationView>
  );
}

/**
 * A group of controls stacked one above the other — a list of servers, an
 * on-screen keyboard. `grid` makes a stack of `<FocusRegion>` rows behave as a
 * grid: without it, moving down lands on each row's last-focused key (Down
 * from T lands on A); with it, the navigator keeps the column position.
 */
function FocusColumn({ children, style, grid = false }: Readonly<FocusColumnProps>) {
  return (
    <SpatialNavigationView direction="vertical" alignInGrid={grid} style={flat(style)}>
      {children}
    </SpatialNavigationView>
  );
}

export type { FocusColumnProps, FocusScopeProps, ScreenScopeProps };
export { FocusColumn, FocusRegion, FocusScope, useLockFocusBehind };
