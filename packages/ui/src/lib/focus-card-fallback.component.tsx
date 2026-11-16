import type { StyleProp, ViewStyle } from 'react-native';

export interface FocusCardProps {
  /** Whether the control under it holds the focus, which is when the effect shows. */
  holdsFocus: boolean;
  /** The control's corner radius from its style; React Native draws a bordered control's corners on a separate layer, so the view cannot be asked. */
  radius: number;
  /** Whether the painted outline is the view the card lies in (`host`) or the first view inside it (`child`). */
  face: 'child' | 'host';
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none';
}

/** Whether this build draws the native focus card. */
export const HAS_FOCUS_CARD = false;

/** The lift, tilt and light of a tvOS card, laid over a focused navigator control without touching its layout. Only Apple TV builds draw it; elsewhere nothing. */
export function FocusCard(_props: Readonly<FocusCardProps>) {
  return null;
}
