import { StyleSheet } from 'react-native';

/** The origin of a box moved to a measured offset. A layout measures from the
 *  left edge in every writing direction, so a box placed by one is pinned there
 *  too. */
export const MEASURED_ORIGIN = StyleSheet.create({ origin: { left: 0 } }).origin;
