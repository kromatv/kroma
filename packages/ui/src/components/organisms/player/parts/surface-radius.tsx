// The corner radius the video surface should currently be drawn with.
//
// The stage shrinks into a rounded card when the settings panel opens, and the
// radius has to reach the SURFACE, not just the box around it: on Apple TV the
// surface is an AVPlayer-backed native view, and a rounded parent does not clip
// its layer - the video kept its square corners inside a rounded card.
//
// It travels as context rather than as a prop because the surface is supplied by
// the client (`<Player surface={…}>`) and only React's tree knows where it ended
// up. A provider renders no element of its own, which matters on the web: the
// player's injected stylesheet sizes the in-page `<video>` through a DIRECT-child
// selector, and any wrapper would break it.

import { createContext, type ReactNode, useContext } from 'react';
import type { Animated } from 'react-native';

/** A plain number, or an Animated value while the card is opening/closing. */
export type SurfaceRadius = number | Animated.AnimatedInterpolation<number>;

const SurfaceRadiusContext = createContext<SurfaceRadius>(0);

export function SurfaceRadiusProvider({
  radius,
  children,
}: Readonly<{ radius: SurfaceRadius; children: ReactNode }>) {
  return <SurfaceRadiusContext.Provider value={radius}>{children}</SurfaceRadiusContext.Provider>;
}

/** Read the radius the surface should round itself to. 0 when fullscreen. */
export function useSurfaceRadius(): SurfaceRadius {
  return useContext(SurfaceRadiusContext);
}
