import { StyleSheet, type ViewStyle } from 'react-native';

/** Holds a bar to the bottom of what scrolls under it, clear of the safe area. */
export const BOTTOM_DOCK = StyleSheet.create({
  dock: {
    position: 'sticky',
    bottom: 0,
    zIndex: 70,
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
  } as unknown as ViewStyle,
}).dock;
