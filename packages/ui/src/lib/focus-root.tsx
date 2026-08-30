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

import { NavigatorRoot, NavigatorView } from '@kroma/spatial-nav/react';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useRemoteHostProps } from './focus-remote';
import { flat } from './nav-style';

export interface FocusRootProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Whether this navigator answers the remote at all. False for a scope that
   *  is mounted but not in play - a parked sheet, say - whose nodes must stay
   *  registered, in the order they registered, without taking presses meant for
   *  something else. */
  active?: boolean;
  /** Whether to draw the key host below. False while a platform chrome owns the
   *  television's focus, which is Apple TV's search screen and nothing else
   *  (see focus-platform), and false wherever `bridge` is. */
  keyHost?: boolean;
  /** Whether this root carries the Android key transport. Default true; false
   *  for a scope that reuses another root's, whose second host would deliver
   *  each press again on the way up. See {@link ScreenScopeProps.bridge}. */
  bridge?: boolean;
  /** A direction the navigator handled with nothing to move to. */
  onEdge?: (direction: string) => void;
}

export function FocusRoot({
  children,
  style,
  active = true,
  keyHost = true,
  bridge = true,
  onEdge,
}: Readonly<FocusRootProps>) {
  // Android delivers keys to the focused VIEW rather than through a global
  // stream, so the key host below is also where they arrive. Empty elsewhere.
  const hostProps = useRemoteHostProps(bridge);
  return (
    <NavigatorRoot active={active} onEdge={onEdge}>
      {/* The one thing tvOS focuses, and the reason the remote is heard at all: a
          directional press reaches the app only when the app owns the focus, and
          with nothing focusable in the window the system keeps every key and
          `useTVEventHandler` never fires. This full-screen transparent host holds
          the platform's focus so it can never move; every press then arrives as
          an event for the navigator to interpret. Pressable, not View, because
          that is what this fork actually makes focusable.

          Gone while a platform chrome is up: it is the chrome's field and
          keyboard the television must be able to focus then, and a focusable
          spread over the whole screen would take that focus and never give it
          back. Gone too when this root carries no transport: Android delivers a
          press to whatever holds the platform focus, so a host that takes it
          without a handler above it is where the remote goes to die. */}
      {/* Android hands a key to whichever view holds the PLATFORM focus, and
          `topKeyDown` BUBBLES. The focus walks off the host onto the navigator's
          own views as soon as one is focused, so a handler on the host alone
          hears the first press and nothing after it. This wrapper is their
          common ancestor, so it hears every press wherever the focus sits. It
          must be the ONLY node on the bubble path carrying them, or the first
          press arrives twice. Empty off Android. */}
      <View style={FILL} {...hostProps}>
        {keyHost && bridge ? (
          <Pressable focusable isTVSelectable hasTVPreferredFocus style={KEY_HOST} />
        ) : null}
        <NavigatorView direction="vertical" style={flat([FILL, style])}>
          {children}
        </NavigatorView>
      </View>
    </NavigatorRoot>
  );
}

const FILL = { flex: 1 } as const;
const KEY_HOST = StyleSheet.absoluteFill;
