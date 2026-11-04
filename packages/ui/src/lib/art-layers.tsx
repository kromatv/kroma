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
  const focal = parsePosition(input.position);
  const placed = fit === 'cover' && (focal.x !== 0.5 || focal.y !== 0.5);

  useLayoutEffect(() => {
    if (src) opacity.setValue(0);
  }, [src, opacity]);

  const rect = placed ? coverRect(box, natural, focal) : null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev?.width === width && prev.height === height ? prev : { width, height }));
  };

  return {
    surface: (style: StyleProp<ViewStyle>, children: ReactNode) => (
      <View onLayout={placed ? onLayout : undefined} style={style}>
        {children}
      </View>
    ),
    layers: nativeLayers({
      ...input,
      backend,
      rect,
      opacity,
      setNatural: placed ? setNatural : undefined,
    }),
  };
}
