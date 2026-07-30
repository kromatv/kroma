// The kit app: the same workbench the site serves, compiled by React Native.
//
// `Platform.isTV` is a build-time fact on the tvOS fork (the same bundle is
// never both), so this is a fork in the shell rather than a runtime check:
//
//   television  the workbench sits on <TvStage>, the fixed 1920x1080 canvas
//               every 10-foot screen is authored against.
//   phone       no stage: a 44pt hit target is the real 44pt.

import { KIT_FONTS } from '@kroma/ui/fonts';
import { OverlayHost, TvStage } from '@kroma/ui/kit';
import { colors } from '@kroma/ui/tokens';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import type { ReactNode } from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Kit } from './config';

LogBox.ignoreAllLogs(true);

function Stage({ children }: Readonly<{ children: ReactNode }>) {
  // <OverlayHost>: a TV's own view controller never receives a press from the
  // remote, so React Native's <Modal> cannot work here (see @kroma/ui's
  // lib/overlay-host).
  //
  // Placed INSIDE the stage: a dialog is authored in the same 1920 canvas as
  // the screen it covers, so a host outside the stage would draw a 720-wide
  // panel in raw screen pixels.
  const hosted = <OverlayHost>{children}</OverlayHost>;
  return Platform.isTV ? <TvStage>{hosted}</TvStage> : <SafeFrame>{hosted}</SafeFrame>;
}

// The phone's own bezel, kept out of the workbench: the workbench draws edge
// to edge, right for a browser window and for <TvStage>, but on a phone the
// status bar and home indicator sit ON TOP of the window. Inset rather than
// <SafeAreaView> so a landscape phone gets its left/right notch too.
function SafeFrame({ children }: Readonly<{ children: ReactNode }>) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.frame,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function App() {
  // Reading a component's props is not interacting with the app, and a TV with
  // nothing to click has no reason to think you have left.
  useKeepAwake();
  // Render on failure too: blocking until fonts load leaves the screen blank,
  // indistinguishable on TV from a frozen app.
  const [fontsLoaded, fontError] = useFonts(KIT_FONTS);
  const ready = fontsLoaded || fontError !== null;
  return (
    // The provider wraps the font gate, not the reverse: it measures the window
    // on mount, so gating it would render the first frame with insets at zero.
    <SafeAreaProvider style={styles.frame}>
      {ready ? (
        <Stage>
          <Kit />
        </Stage>
      ) : null}
    </SafeAreaProvider>
  );
}

// Painted, not transparent: an unpainted inset shows the root view through
// it, white until `expo-system-ui` applies `ios.backgroundColor`.
const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.bg },
});
