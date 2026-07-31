// The 10-foot stage: every TV screen is authored against a fixed 1920x1080 canvas
// and scaled here to what the platform reports. Android TV reports 960x540 dp at
// density 2.0, so without this the whole design renders at double size there.

import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { styles } from '#ui/core';
import { CANVAS } from '#ui/core/tokens';

interface TvStageProps {
  children: ReactNode;
}

function TvStage({ children }: Readonly<TvStageProps>) {
  const { width, height } = useWindowDimensions();
  // Contain, never cover: a cropped stage loses the overscan-safe gutters.
  const scale = Math.min(width / CANVAS.width, height / CANVAS.height);

  return (
    <View style={s.viewport}>
      <View style={[s.canvas, { transform: [{ scale }] }]}>{children}</View>
    </View>
  );
}

const s = styles({
  viewport: { flex: true, bg: 'bg', center: true, overflow: 'hidden' },
  canvas: { w: CANVAS.width, h: CANVAS.height, bg: 'bg', overflow: 'hidden' },
});

export type { TvStageProps };
export { TvStage };
