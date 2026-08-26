import type { ViewStyle } from 'react-native';

// A CSS `env()` string in a React Native style, which the types do not admit.
// The native spelling is `useSafeAreaInsets()`, and reaching for it means adding
// `react-native-safe-area-context` to this client and a provider at its root.
const inset = (side: 'Top' | 'Bottom', min: number): ViewStyle =>
  ({
    [`padding${side}`]: `max(${min}px, env(safe-area-inset-${side.toLowerCase()}))`,
  }) as unknown as ViewStyle;

/** Top padding that clears a phone's notch, never less than `min`. */
export const safeAreaTop = (min: number): ViewStyle => inset('Top', min);

/** Bottom padding that clears a phone's home indicator, never less than `min`. */
export const safeAreaBottom = (min: number): ViewStyle => inset('Bottom', min);
