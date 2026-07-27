// expo-image as the design system's image decoder on this app.
//
// @kroma/ui's <Img> owns the design (the container, the instant gradient
// placeholder, the cross-fade timing, the cover maths) and asks a backend to
// draw the leaf. The TVs use React Native's own <Image>: art comes over the LAN
// and the platform HTTP cache is enough. A phone is different, so this one
// registers expo-image for its memory + disk cache and its list recycling,
// which is what keeps a poster grid smooth while scrolling on cellular.
//
// It declares `fades: true`, so <Img> hands it the design's fade duration and
// leaves the opacity alone rather than animating a component it does not own.

import type { ImageBackend } from '@kroma/ui/kit';
import { Image } from 'expo-image';

export const expoImageBackend: ImageBackend = {
  fades: true,
  render: ({ uri, fit, style, fadeMs, accessibilityLabel, onLoad, onError }) => (
    <Image
      source={{ uri }}
      contentFit={fit === 'stretch' ? 'fill' : fit}
      transition={fadeMs}
      cachePolicy="memory-disk"
      // Recycling by url is what lets a long list reuse views instead of
      // decoding the same poster again on every scroll pass.
      recyclingKey={uri}
      style={style}
      accessibilityLabel={accessibilityLabel}
      onLoad={(e) => onLoad?.({ width: e.source.width, height: e.source.height })}
      onError={onError}
    />
  ),
};
