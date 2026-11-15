import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

export interface FocusShieldProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Whether the platform focus engine is kept out of the subtree. Only Apple TV
   *  honours it; elsewhere this is a plain View. */
  shielded: boolean;
}

/** A View whose subtree the television's own focus search never walks. */
export function FocusShield({ children, style }: Readonly<FocusShieldProps>) {
  return <View style={style}>{children}</View>;
}
