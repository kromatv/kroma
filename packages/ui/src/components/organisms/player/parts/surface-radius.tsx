// The corner radius the video surface should currently be drawn with. It must
// reach the surface itself: on Apple TV the surface is an AVPlayer-backed native
// view, and a rounded parent does not clip its layer. The provider renders no
// element of its own — the player's stylesheet sizes the in-page `<video>`
// through a direct-child selector that any wrapper would break.

import { createContext, type ReactNode, useContext } from 'react';
import type { Animated } from 'react-native';

export type SurfaceRadius = number | Animated.AnimatedInterpolation<number>;

const SurfaceRadiusContext = createContext<SurfaceRadius>(0);

export function SurfaceRadiusProvider({
  radius,
  children,
}: Readonly<{ radius: SurfaceRadius; children: ReactNode }>) {
  return <SurfaceRadiusContext.Provider value={radius}>{children}</SurfaceRadiusContext.Provider>;
}

/** The radius the surface should round itself to; 0 when fullscreen. */
export function useSurfaceRadius(): SurfaceRadius {
  return useContext(SurfaceRadiusContext);
}
