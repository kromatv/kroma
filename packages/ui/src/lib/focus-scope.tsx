import { createFocusServices } from './focus-services';
import { FocusServicesProvider, useFocusServicesParent } from './focus-services-context';
import { InputGateProvider, useInputGate } from './input-gate';
import { InputSourceProvider, useInputSourceParent } from './input-source';
// <FocusScope>: the navigator for one screen, and the groups inside it.
// Exactly one navigator answers the remote at a time; shared between web and
// native on purpose so behaviour can't drift between them (only the screen
// root is forked, into focus-root.tsx / focus-root.web.tsx).

import { NavigatorView, RemoteProvider, useLockNavigator } from '@kromatv/spatial-nav/react';
import { type ReactNode, useEffect, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { createFocusEntry, FocusEntryProvider } from './focus-entry';
import { FocusLiftHost, GROUNDED, LIFTED } from './focus-lift';
import { PlatformFocusProvider, usePlatformFocusHost } from './focus-platform';
import { FocusPresenceProvider, useInsideFocusScope } from './focus-presence';
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
   * Mount this scope's remote transports. Default true; a scope that reuses
   * another root's passes `false`: the event bridge fans to every registered
   * navigator, so a second one would deliver each press twice. An
   * `<OverlayHost>` dialog reuses the screen's, a `<Modal>`-backed one is in
   * its own view controller and needs its own. Reusing means leaving the
   * platform focus behind as well; see {@link FocusRootProps.keyHost}.
   */
  bridge?: boolean;
  /** Whether this scope answers the remote. See {@link FocusRootProps.active}. */
  active?: boolean;
}

interface FocusColumnProps extends FocusScopeProps {
  grid?: boolean;
}

/**
 * Also what a DIALOG mounts, over the screen that opened it, paired with
 * {@link useLockFocusBehind} on the screen: that locks the screen's navigator
 * out of the remote, leaving this root the only one listening. Its
 * `FocusEntryProvider` runs during render (not an effect) so the dialog's
 * `autoFocus` claims the ring before the screen underneath decides; on the
 * browser targets it also resets device-type to remote-keys mode regardless
 * of where the pointer was left.
 */
function FocusScopeHost({
  children,
  style,
  entryKey,
  bridge = true,
  active = true,
}: Readonly<ScreenScopeProps>) {
  const platform = usePlatformFocusHost();
  // Hooks cannot be conditional, so the flag is read INSIDE the bridge rather
  // than around it. A chrome typing on the platform's own keyboard is heard by
  // this bridge too, and posting those presses would walk the ring behind it.
  const remote = bridge && platform.owner !== 'platform';
  useRemoteBridge(remote);
  // A replacement screen gets a fresh claim before children render.
  const [claim, setClaim] = useState(() => ({ key: entryKey, entry: createFocusEntry() }));
  if (claim.key !== entryKey) setClaim({ key: entryKey, entry: createFocusEntry() });
  const { entry } = claim;
  return (
    // Lets a kit control exist OUTSIDE any scope (a phone screen, a plain web
    // page) without registering with a navigator that was never mounted.
    <FocusEntryProvider value={entry}>
      <FocusPresenceProvider value={true}>
        <PlatformFocusProvider value={platform.host}>
          <FocusRoot
            style={style}
            active={active}
            bridge={remote}
            keyHost={platform.owner === null}
            onEdge={platform.onEdge}
          >
            {children}
          </FocusRoot>
        </PlatformFocusProvider>
      </FocusPresenceProvider>
    </FocusEntryProvider>
  );
}

function FocusScope(props: Readonly<ScreenScopeProps>) {
  const parent = useFocusServicesParent();
  const input = useInputGate();
  const source = useInputSourceParent();
  const [owned] = useState(() =>
    parent ? null : createFocusServices(true, input, source ?? undefined),
  );
  const services = parent ?? owned;
  if (!services) throw new Error('Focus scope requires its owning host');
  useEffect(() => services.source.retain(), [services]);
  return (
    <FocusServicesProvider value={services}>
      <InputGateProvider value={services.input}>
        <InputSourceProvider value={services.source}>
          <RemoteProvider value={services.remote}>
            <FocusScopeHost {...props} />
          </RemoteProvider>
        </InputSourceProvider>
      </InputGateProvider>
    </FocusServicesProvider>
  );
}

/**
 * Locks the navigator this component sits in out of the remote while `active`.
 * Called from OUTSIDE the scope it protects, so it locks the screen rather
 * than the dialog opened over it.
 */
function useLockFocusBehind(active: boolean): void {
  const { lock, unlock } = useLockNavigator();
  useEffect(() => {
    if (!active) return;
    lock();
    // The navigator counts locks rather than holding a flag, so overlapping
    // surfaces (a picker opened from a dialog) unlock in any order.
    return unlock;
  }, [active, lock, unlock]);
}

/**
 * A group of controls that belong together on one line: the nav bar, a
 * hero's buttons, a rail. The navigator moves between groups vertically and
 * inside a group horizontally; nothing measures anything, the shape comes
 * from the tree.
 */
function FocusRegion({ children, style }: Readonly<FocusScopeProps>) {
  // A group is only a group to a navigator. Unscoped - the browser app, a
  // phone - there is none to register with, and asking would throw ("No
  // registered spatial navigator"), so the row is a plain view. This is the
  // same degradation <Focusable> makes, and it is what lets a kit component
  // holding a FocusRegion (a dialog's action row) render in an app that has
  // no spatial navigation at all.
  if (!useInsideFocusScope()) return <View style={flat(style)}>{children}</View>;
  return (
    <FocusLiftHost>
      {(held) => (
        // The row lifts ITSELF while it holds the focus: rows are separate
        // stacking contexts, so a lifted tile is still under the whole of the
        // row after it. No wrapper view - one would collapse the row.
        <NavigatorView direction="horizontal" style={flat([style, held ? LIFTED : GROUNDED])}>
          {children}
        </NavigatorView>
      )}
    </FocusLiftHost>
  );
}

/**
 * A group of controls stacked one above the other: a list of servers, an
 * on-screen keyboard. `grid` makes a stack of `<FocusRegion>` rows behave as a
 * grid: without it, moving down lands on each row's last-focused key (Down
 * from T lands on A); with it, the navigator keeps the column position.
 */
function FocusColumn({ children, style, grid = false }: Readonly<FocusColumnProps>) {
  // See <FocusRegion>: unscoped, a stack is just a stack.
  if (!useInsideFocusScope()) return <View style={flat(style)}>{children}</View>;
  return (
    <FocusLiftHost>
      {(held) => (
        <NavigatorView
          direction="vertical"
          alignInGrid={grid}
          style={flat([style, held ? LIFTED : GROUNDED])}
        >
          {children}
        </NavigatorView>
      )}
    </FocusLiftHost>
  );
}

export type { FocusColumnProps, FocusScopeProps, ScreenScopeProps };
export { FocusColumn, FocusRegion, FocusScope, useLockFocusBehind };
