// expo-image as <Img>'s decoder on the phone, for its memory + disk cache and
// its list recycling, what keeps a poster grid smooth on cellular.

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
      recyclingKey={uri}
      style={style}
      accessibilityLabel={accessibilityLabel}
      onLoad={(e) => onLoad?.({ width: e.source.width, height: e.source.height })}
      onError={onError}
    />
  ),
};
