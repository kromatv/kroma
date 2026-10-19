import { Image } from 'expo-image';
import { Platform } from 'react-native';
import type { ImageBackend } from './image-backend';

const DOWNSCALE = Platform.OS !== 'ios';

/** <Img>'s decoder on the Expo targets. Adds the memory + disk cache and the
 *  list recycling React Native's own <Image> lacks, so a rail does not
 *  re-download and re-decode every poster on every navigation. */
export const expoImageBackend: ImageBackend = {
  fades: true,
  render: ({ uri, fit, style, fadeMs, accessibilityLabel, onLoad, onError }) => (
    <Image
      source={{ uri }}
      contentFit={fit === 'stretch' ? 'fill' : fit}
      transition={fadeMs}
      cachePolicy="memory-disk"
      allowDownscaling={DOWNSCALE}
      recyclingKey={uri}
      style={style}
      accessibilityLabel={accessibilityLabel}
      onLoad={(e) => onLoad?.({ width: e.source.width, height: e.source.height })}
      onError={onError}
    />
  ),
};
