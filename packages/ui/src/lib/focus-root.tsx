// The screen ROOT of the navigator, native half.
//
// This is the one part of <FocusScope> that genuinely differs between the
// targets, so it is the only part forked (see focus-root.web.tsx); the rows
// and columns inside a screen are identical on both and live once, in
// focus-scope.tsx.
//
// Nothing on a screen is natively focusable: a full-screen transparent
// Pressable holds the platform's focus instead of a `TVFocusGuideView
// autoFocus`, which the native side turned into a UIFocusGuide constrained to
// the WHOLE SCREEN - a focus candidate in every direction that caught any
// press without a legitimate target.

import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import { SpatialNavigationRoot, SpatialNavigationView } from 'react-tv-space-navigation';
import { useRemoteHostProps } from './focus-remote';
import { flat } from './nav-style';

export interface FocusRootProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function FocusRoot({ children, style }: Readonly<FocusRootProps>) {
  // Android delivers keys to the focused VIEW rather than through a global
  // stream, so the key host below is also where they arrive. Empty elsewhere.
  const hostProps = useRemoteHostProps();
  return (
    <SpatialNavigationRoot isActive>
      {/* The one thing tvOS focuses, and the reason the remote is heard at all: a
          directional press reaches the app only when the app owns the focus, and
          with nothing focusable in the window the system keeps every key and
          `useTVEventHandler` never fires. This full-screen transparent host holds
          the platform's focus so it can never move; every press then arrives as
          an event for the navigator to interpret. Pressable, not View, because
          that is what this fork actually makes focusable. */}
      <Pressable focusable isTVSelectable hasTVPreferredFocus style={KEY_HOST} {...hostProps} />
      <SpatialNavigationView direction="vertical" style={flat([FILL, style])}>
        {children}
      </SpatialNavigationView>
    </SpatialNavigationRoot>
  );
}

const FILL = { flex: 1 } as const;
const KEY_HOST = StyleSheet.absoluteFill;
