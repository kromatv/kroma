import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useStyleScope } from '#ui/core';
import type { ArtLayers, ArtLayersInput } from './art-layers-types';
import { StaticView } from './static-view';
import { webLayers } from './web-layers';

/** Draws artwork as `<img>` layers whose fade the browser owns. */
export function useArtLayers(input: Readonly<ArtLayersInput>): ArtLayers {
  const scope = useStyleScope();
  return {
    surface: (style: StyleProp<ViewStyle>, children: ReactNode) => (
      <StaticView style={style}>{children}</StaticView>
    ),
    layers: webLayers(input, scope),
  };
}
