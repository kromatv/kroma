import { Animated, Pressable } from 'react-native';

/** The pressable a touch control renders: animated, so the native press dip rides an Animated value. */
export const PressHost = Animated.createAnimatedComponent(Pressable) as unknown as typeof Pressable;
