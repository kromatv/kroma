import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export interface FrostSourceProps {
  /** The screen's full-bleed art. Null leaves `backdrop` drawn and the surfaces
   *  on it with their plain fill. */
  src: string | null;
  /** The art's CSS object-position, as `backdrop` places it. Defaults to `'50% 50%'`. */
  position?: string;
  /** The `<Veil>` ramp `backdrop` lays over the art. */
  veil?: string;
  /** Blur strength in CSS px. Defaults to 12, `<Frost>`'s own default. */
  amount?: number;
  /** The art and veil as the screen draws them, shown wherever the layer cannot draw. */
  backdrop: ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}
