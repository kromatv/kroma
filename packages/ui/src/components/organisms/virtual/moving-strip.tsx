import type { ReactElement } from 'react';
import type { ViewStyle } from 'react-native';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { ease } from '#ui/lib/ease';
import { GlideView } from '#ui/lib/glide-view';
import { SETTLE_MS } from './strip-motion';

type Axis = 'x' | 'y';

interface MovingStripProps {
  /** How far the strip has travelled, in px along `axis`. The content is
   *  translated by the NEGATIVE of it, so a growing offset walks it out of view. */
  offset: number;
  axis: Axis;
  /** Travel there with no transition. True while a gesture drives the strip, so
   *  it tracks the input rather than chasing it. */
  still?: boolean;
  style?: ViewStyle;
  children: ReactElement;
}

function MovingStrip({ offset, axis, still = false, style, children }: Readonly<MovingStripProps>) {
  const s = useStyles(sDefinition);

  return (
    <GlideView
      x={axis === 'x' ? -offset : 0}
      y={axis === 'y' ? -offset : 0}
      ms={SETTLE_MS}
      easing={ease.out}
      still={still}
      style={[axis === 'x' ? s.row : null, style]}
    >
      {children}
    </GlideView>
  );
}

const sDefinition = styles({
  row: { row: true, align: 'center' },
});

export { MovingStrip };
