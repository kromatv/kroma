// Artwork with the design system's fade, over the per-title gradient the other
// clients use. Wraps @kroma/ui's <Img> with this app's call shape (`uri` +
// `seed`).

import { posterColors } from '@kroma/core';
import { Img, tintGradient } from '@kroma/ui/kit';
import type { ImageContentFit } from 'expo-image';
import type { StyleProp, ViewStyle } from 'react-native';

export interface FadeImageProps {
  uri: string | null;
  seed?: string;
  fit?: ImageContentFit;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function FadeImage({
  uri,
  seed,
  fit = 'cover',
  radius = 0,
  style,
}: Readonly<FadeImageProps>) {
  return (
    <Img
      src={uri}
      background={tintGradient(posterColors(seed ?? uri ?? 'kroma'))}
      fit={fit === 'contain' ? 'contain' : 'cover'}
      radius={radius}
      style={style}
    />
  );
}
