import type { StyleProp, ViewStyle } from 'react-native';

/** Where a glide box stands, in its parent's coordinates. */
export interface GlideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A box that travels to each rect it is given and fades out on null, keeping its last place. */
export interface GlideBoxProps {
  rect: GlideRect | null;
  durationMs: number;
  /** Only x and width travel, x on the compositor; y and height are taken as given. */
  slideX?: boolean;
  style?: StyleProp<ViewStyle>;
}
