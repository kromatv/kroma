import { type ReactNode, useLayoutEffect, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import type { ArtLayers, ArtLayersInput } from './art-layers-types';
import { coverRect, parsePosition } from './cover-rect';
import { useImageBackend } from './image-backend';
import { nativeLayers, type Size } from './native-layers';

/** Draws artwork through the image backend, placing a cover by its focal point. */
export function useArtLayers(input: Readonly<ArtLayersInput>): ArtLayers {
  const backend = useImageBackend();
  const [box, setBox] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const { src, fit } = input;

  useLayoutEffect(() => {
    if (src) opacity.setValue(0);
  }, [src, opacity]);

  const rect = fit === 'cover' ? coverRect(box, natural, parsePosition(input.position)) : null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev?.width === width && prev.height === height ? prev : { width, height }));
  };

  return {
    surface: (style: StyleProp<ViewStyle>, children: ReactNode) => (
      <View onLayout={onLayout} style={style}>
        {children}
      </View>
    ),
    layers: nativeLayers({ ...input, backend, rect, opacity, setNatural }),
  };
}
