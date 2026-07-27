// The screen ROOT of the navigator, native half.
//
// This is the one part of <FocusScope> that genuinely differs between the
// targets, and so the only part that is forked (see focus-root.web.tsx). The
// rows and columns inside a screen are identical on both and live once, in
// focus-scope.tsx - which is the fix for the two files that used to be
// byte-identical apart from this function: a prop added to <FocusColumn> could
// be added to one of them and silently give the browser TVs different focus
// behaviour from the native ones.
//
// This replaces what the OS focus engine used to do here. It used to be a
// `TVFocusGuideView autoFocus`, which the native side turns into a UIFocusGuide
// constrained to the WHOLE SCREEN - a focus candidate in every direction, so any
// press without a legitimate target was caught by it and thrown back to the
// screen's first control. That is gone: nothing on a screen is natively
// focusable any more, so there is nothing for the platform to guess at.

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
      {/* The one thing tvOS focuses, and the reason the remote is heard at all.
          A directional press is delivered to the app only when the app owns the
          focus: with nothing focusable in the window the system keeps every key
          and `useTVEventHandler` never fires - measured, with a trace, twice.
          So one full-screen transparent host sits behind the content and holds
          the platform's focus, which can then never MOVE because there is
          nowhere else for it to go. Every press arrives as an event, and the
          navigator decides what it means. A Pressable rather than a View
          because that is what this fork actually makes focusable. */}
      <Pressable focusable isTVSelectable hasTVPreferredFocus style={KEY_HOST} {...hostProps} />
      <SpatialNavigationView direction="vertical" style={flat([FILL, style])}>
        {children}
      </SpatialNavigationView>
    </SpatialNavigationRoot>
  );
}

const FILL = { flex: 1 } as const;
const KEY_HOST = StyleSheet.absoluteFill;
