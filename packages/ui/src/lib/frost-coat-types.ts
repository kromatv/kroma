import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

/** The two halves of a frost. Spread `style` onto the surface's own style list
 *  and render `layer` as its first child; exactly one of them is ever set. */
export interface FrostCoat {
  style: ViewStyle | null;
  layer: ReactNode;
}

/** The coat of a surface that wears no frost. */
export const BARE: FrostCoat = { style: null, layer: null };
