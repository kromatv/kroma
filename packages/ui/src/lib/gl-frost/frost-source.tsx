import { View } from 'react-native';
import type { FrostSourceProps } from './frost-source-types';

/** The frame a screen's full-bleed art fills. Native frost blurs on its own,
 *  so here it only draws the backdrop under the screen. */
export function FrostSource({ backdrop, style, children }: Readonly<FrostSourceProps>) {
  return (
    <View style={style}>
      {backdrop}
      {children}
    </View>
  );
}
