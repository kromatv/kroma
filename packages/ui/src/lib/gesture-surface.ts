import type { ViewProps } from 'react-native';

/** Props for a view that runs its own pointer gesture, so the click it ends in never also presses the control around it. Empty off the web, where no click reaches an ancestor. */
export const GESTURE_SURFACE: ViewProps = {};
