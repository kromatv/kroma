import { KitProvider } from '#ui/configure';
import { type StyleScope, sharedStyle, styles, useStyleScope } from '#ui/core';

// The 10-foot stage: every TV screen is authored against a fixed 1920x1080 canvas
// and scaled here to what the platform reports. Android TV reports 960x540 dp at
// density 2.0, so without this the whole design renders at double size there.

import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useStyles } from '#ui/core/styles';
import { CANVAS } from '#ui/core/tokens';

interface TvStageProps {
  children: ReactNode;
}

const scaleOf = (scale: number, scope: StyleScope) =>
  sharedStyle(`tv-stage:scale:${scale}`, { transform: [{ scale }] }, scope);
function TvStage({ children }: Readonly<TvStageProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const { width, height } = useWindowDimensions();
  // Contain, never cover: a cropped stage loses the overscan-safe gutters.
  const scale = Math.min(width / CANVAS.width, height / CANVAS.height);

  return (
    <KitProvider config={STAGE_CONFIG}>
      <View style={[s.viewport, s.ground]}>
        <View style={[s.canvas, scaleOf(scale, scope)]}>{children}</View>
      </View>
    </KitProvider>
  );
}

const STAGE_CONFIG = Object.freeze({ designWidth: CANVAS.width });

const sDefinition = styles({
  viewport: { flex: true, center: true, overflow: 'hidden' },
  ground: { bg: 'bg' },
  canvas: { w: CANVAS.width, h: CANVAS.height, bg: 'bg', overflow: 'hidden' },
});

export type { TvStageProps };
export { TvStage };
