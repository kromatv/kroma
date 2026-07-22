// The chromatic wheel "O" of the Kroma lockup, as react-native-svg. The sector
// geometry comes from @kroma/core so this renders the exact same shape as the
// generated app icon and the web lockup.

import { wheelSectors } from '@kroma/core';
import Svg, { Path } from 'react-native-svg';
import { WHEEL_COLORS } from '#mobile/lib/theme';

const SECTORS = wheelSectors(50, 50, 50, 17.045);

export function KromaWheel({ size = 64 }: Readonly<{ size?: number }>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {SECTORS.map((d, i) => (
        <Path key={WHEEL_COLORS[i]} d={d} fill={WHEEL_COLORS[i]} />
      ))}
    </Svg>
  );
}
