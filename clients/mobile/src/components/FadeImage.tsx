// Artwork with the design system's fade, over the per-title gradient the other
// clients use.
//
// This is @kroma/ui's <Img>: it fades in on load and cross-fades when the source
// changes, and it shows the deterministic genre gradient instantly so a tile is
// never blank. What stays here is only this app's call shape (`uri` + `seed`),
// which the screens already use everywhere.

import { posterColors } from '@kroma/core';
import { Img, tintGradient } from '@kroma/ui/kit';
import type { ImageContentFit } from 'expo-image';
import type { StyleProp, ViewStyle } from 'react-native';

export interface FadeImageProps {
  uri: string | null;
  /** Seed for the placeholder gradient (item id keeps it stable per title). */
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
