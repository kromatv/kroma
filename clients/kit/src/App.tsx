// The kit app: the same workbench the site serves, compiled by React Native.
//
// It exists so that "inspect the kit on the device that actually has to display
// it" is its OWN app rather than a branch inside every product shell. The TV
// client used to carry the whole design system behind an env flag purely to
// offer this; now it carries the product and nothing else, and this is what you
// launch at a simulator.
//
// One app, both shapes. `Platform.isTV` is a build-time fact on the tvOS fork
// (the same bundle is never both), so this is a fork in the shell rather than a
// runtime feature check:
//
//   television  the workbench sits on <TvStage>, the fixed 1920x1080 canvas
//               every 10-foot screen is authored against - so the kit is being
//               judged at the size and distance it ships at.
//   phone       no stage: the point of the phone build is the REAL point grid,
//               where a 44pt hit target is 44pt.

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
  // <OverlayHost> for the same reason the TV client mounts one: a dialog cannot
  // use React Native's <Modal> on a television, whose own view controller never
  // receives a press from the remote (see @kroma/ui's lib/overlay-host). It also
  // means the workbench shows dialogs the way the product actually ships them
  // rather than through a path no TV takes.
  //
  // INSIDE the stage, exactly where the TV client puts it (its host wraps the
  // router, and the router is inside <TvStage>). A dialog is authored in the
  // same 1920 canvas as the screen it covers, so a host outside the stage would
  // draw a 720-wide panel in raw screen pixels - a stamp on a 4K set.
  const hosted = <OverlayHost>{children}</OverlayHost>;
  return Platform.isTV ? <TvStage>{hosted}</TvStage> : <SafeFrame>{hosted}</SafeFrame>;
}

/** The phone's own bezel, kept out of the workbench.
 *
 * The workbench draws edge to edge, because that is right on the two surfaces it
 * was built for: a browser window has no bezel, and <TvStage> already insets for
 * overscan. A phone has neither luxury - the status bar and the home indicator
 * sit ON TOP of the window - so its toolbar rendered under the clock and the
 * dynamic island, and the docs bar ran off the bottom edge.
 *
 * Padding here rather than inside @kroma/workbench on purpose: the workbench
 * "knows no app", and the device's chrome is exactly the sort of thing the host
 * is supposed to absorb for it - the same division that already puts the i18n
 * provider and the story registry out here. Inset rather than a <SafeAreaView>
 * so a landscape phone gets its left/right notch too, which the edges-only
 * component would miss.
 */
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
  // Render on FAILURE as well as on success. A missing font is a cosmetic
  // problem; blocking on it renders nothing at all, and on a television that is
  // indistinguishable from a frozen app with no way to find out why.
  const [fontsLoaded, fontError] = useFonts(KIT_FONTS);
  const ready = fontsLoaded || fontError !== null;
  return (
    // The provider wraps the font gate rather than sitting inside it. It measures
    // the window on mount, so gating IT would mean the first frame the workbench
    // draws is the one where the insets are still zero - the toolbar would land
    // under the clock and then jump down.
    <SafeAreaProvider style={styles.frame}>
      {ready ? (
        <Stage>
          <Kit />
        </Stage>
      ) : null}
    </SafeAreaProvider>
  );
}

/** The bezel is painted, not left transparent: an unpainted inset shows the root
 * view through it, which is white until `expo-system-ui` applies the
 * `ios.backgroundColor` from app.json. */
const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.bg },
});
