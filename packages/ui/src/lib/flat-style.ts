import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

// The tvos react-native fork's ViewStyle and mainline's are not assignable to
// each other; flatten once, here.
const flat = (style: StyleProp<ViewStyle>): ViewStyle | undefined =>
  StyleSheet.flatten(style) as ViewStyle | undefined;

export { flat };
