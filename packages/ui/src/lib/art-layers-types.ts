import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Radius } from '#ui/core/tokens/layout';

/** What an artwork surface asks its layers to draw. */
export interface ArtLayersInput {
  src: string | null;
  under: string | null;
  alt: string;
  fit: 'cover' | 'contain';
  position: string;
  radius: Radius | undefined;
  priority: boolean;
  duration: number;
  errored: boolean;
  layered: boolean;
  markLoaded: () => void;
  onCovered: ((src: string) => void) | undefined;
  onLoad: (() => void) | undefined;
  onError: () => void;
}

/** The drawn layers, and the box that holds them with whatever listener they need. */
export interface ArtLayers {
  layers: ReactNode;
  surface: (style: StyleProp<ViewStyle>, children: ReactNode) => ReactNode;
}
