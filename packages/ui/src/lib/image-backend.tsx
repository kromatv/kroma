// The image backend <Img> draws its leaf with, on the native targets.
//
// <Img> owns everything that is DESIGN: the container, the instant gradient
// placeholder, the cross-fade timing, the cover maths. What it does not own is
// which decoder loads the bytes, and that is a genuine platform choice rather
// than a design one:
//
//   - React Native's own <Image> is the default. It needs no dependency and it
//     is what the TV apps use, where art is fetched over the LAN and the
//     platform HTTP cache is enough.
//   - expo-image is what a phone wants: memory + disk caching and list
//     recycling, which matter when a poster grid is scrolled over cellular.
//
// An app registers its backend once, at the root. That is dependency injection
// rather than a conditional import, so the bundler never has to reason about it
// and a target that does not install expo-image never sees it.

import type { ReactElement } from 'react';
import { Animated, type ImageStyle, type StyleProp } from 'react-native';

export interface ImageBackendProps {
  uri: string;
  fit: 'cover' | 'contain' | 'stretch';
  style: StyleProp<ImageStyle>;
  /** Fade-in duration in ms. Only meaningful to a backend that declares `fades`. */
  fadeMs: number;
  accessibilityLabel?: string;
  /** Called with the artwork's intrinsic size when the backend can report it;
   *  <Img> needs it only to honour a non-centred `object-position`. */
  onLoad?: (size: { width: number; height: number } | null) => void;
  onError?: () => void;
}

export interface ImageBackend {
  /** True when the backend animates its own load-in. <Img> then leaves opacity
   *  alone instead of cross-fading a component it does not control. */
  fades: boolean;
  render: (props: ImageBackendProps) => ReactElement;
}

/**
 * `Animated.Image`, not the plain one, and that is not decoration: <Img> drives
 * its fade with an `Animated.Value` and hands it to the backend as a style. A
 * plain component cannot read one, and on the New Architecture that is not
 * silently ignored - every frame of every visible image logs
 *
 *   Error while converting prop 'opacity': Value is an object, expected a number
 *
 * which on an Apple TV showing a wall of posters is hundreds of native errors a
 * second, and no fade. Measured on a real device.
 *
 * React Native's own image otherwise: no dependency, and it reports the decoded
 * size, so the focal-point maths works. It does not fade itself, which is why
 * <Img> animates it.
 */
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

let current: ImageBackend = reactNativeImage;

/**
 * Swap the decoder <Img> uses. Call once at the app root, before the first
 * render; the value is read per render, so a later call still takes effect, but
 * changing it mid-session would restart every in-flight load.
 */
export function setImageBackend(backend: ImageBackend): void {
  current = backend;
}

/** The registered backend. */
export function imageBackend(): ImageBackend {
  return current;
}

export { reactNativeImage };
