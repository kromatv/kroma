// The 10-foot stage: every TV screen is authored against a fixed 1920x1080 canvas
// and scaled here to what the platform reports. Android TV reports 960x540 dp at
// density 2.0, so without this the whole design renders at double size there.

import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { CANVAS, colors } from '#ui/lib/tokens';

interface TvStageProps {
  children: ReactNode;
}

function TvStage({ children }: Readonly<TvStageProps>) {
  const { width, height } = useWindowDimensions();
  // Contain, never cover: a cropped stage loses the overscan-safe gutters.
  const scale = Math.min(width / CANVAS.width, height / CANVAS.height);

  return (
    <View style={styles.viewport}>
      <View style={[styles.canvas, { transform: [{ scale }] }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  canvas: {
    width: CANVAS.width,
    height: CANVAS.height,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
});

export type { TvStageProps };
export { TvStage };
