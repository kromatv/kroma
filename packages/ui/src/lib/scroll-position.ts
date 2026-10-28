import { createContext, type RefObject } from 'react';
import type { Animated, View } from 'react-native';

/** The nearest page scroller's live offset and its content view, for what has to move with the scroll without re-rendering on every frame. */
export interface ScrollPosition {
  offset: Animated.Value;
  content: RefObject<View | null>;
}

export const ScrollPositionContext = createContext<ScrollPosition | null>(null);
