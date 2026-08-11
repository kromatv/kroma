import { KIT_FONTS } from '@kroma/ui/fonts';
import { OverlayHost, ThemeProvider, TvStage } from '@kroma/ui/kit';
import { colors } from '@kroma/ui/tokens';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import type { ReactNode } from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Kit } from './config';

LogBox.ignoreAllLogs(true);

function Stage({ children }: Readonly<{ children: ReactNode }>) {
  // Inside the stage: a dialog is authored in the same 1920 canvas as the
  // screen it covers.
  const hosted = <OverlayHost>{children}</OverlayHost>;
  return Platform.isTV ? <TvStage>{hosted}</TvStage> : <SafeFrame>{hosted}</SafeFrame>;
}

// Inset rather than <SafeAreaView> so a landscape phone gets its left and
// right notch too.
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
  useKeepAwake();
  const [fontsLoaded, fontError] = useFonts(KIT_FONTS);
  const ready = fontsLoaded || fontError !== null;
  return (
    // The provider wraps the font gate, not the reverse: it measures the window
    // on mount, so gating it would render the first frame with insets at zero.
    <SafeAreaProvider style={styles.frame}>
      {ready ? (
        <ThemeProvider>
          <Stage>
            <Kit />
          </Stage>
        </ThemeProvider>
      ) : null}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.bg },
});
