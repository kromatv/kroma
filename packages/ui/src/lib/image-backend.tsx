import { useKitSettings } from './kit-settings';
// Which decoder <Img> loads bytes with on the native targets. React Native's own
// <Image> by default; an app registers another (expo-image, on the Expo targets)
// at its root, so a target that does not install expo-image never sees it.

import type { ReactElement } from 'react';
import { Animated, type ImageStyle, type StyleProp } from 'react-native';

export interface ImageBackendProps {
  uri: string;
  fit: 'cover' | 'contain' | 'stretch';
  style: StyleProp<ImageStyle>;
  fadeMs: number;
  accessibilityLabel?: string;
  onLoad?: (size: { width: number; height: number } | null) => void;
  onError?: () => void;
}

export interface ImageBackend {
  /** True when the backend animates its own load-in; <Img> then leaves opacity
   *  alone instead of cross-fading a component it does not control. */
  fades: boolean;
  render: (props: ImageBackendProps) => ReactElement;
}

// `Animated.Image`, not the plain one: <Img> hands its fade in as an
// `Animated.Value`, and on the New Architecture a plain component logs "Error
// while converting prop 'opacity'" for every frame of every visible image.
const reactNativeImage: ImageBackend = {
  fades: false,
  render: ({ uri, fit, style, accessibilityLabel, onLoad, onError }) => (
    <Animated.Image
      source={{ uri }}
      resizeMode={fit}
      style={style}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      onLoad={(e) => onLoad?.(e.nativeEvent.source)}
      onError={onError}
    />
  ),
};

/** The decoder configured by this image's app root. */
export function useImageBackend(): ImageBackend {
  return useKitSettings().image ?? reactNativeImage;
}

export { reactNativeImage };
