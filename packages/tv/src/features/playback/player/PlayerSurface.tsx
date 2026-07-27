// The video surface, on the native targets (Apple TV, Android TV).
//
// One surface, because there is one engine: expo-video's <VideoView>, which is
// AVPlayer on tvOS and Media3/ExoPlayer on Android TV. It sits in the view tree
// like any other view, so the player chrome transforms it into the settings card
// exactly as it does an in-page <video> on the browser targets, and it needs no
// plane-rect plumbing.
//
// See PlayerSurface.web.tsx for the browser half, which has four.

import { useSurfaceRadius } from '@kroma/ui';
import { VideoView } from 'expo-video';
import type { ReactNode } from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { ExpoVideoEngine } from '#tv/features/playback/player/expoVideoEngine';
import type { Playback } from '#tv/features/playback/player/useDirectPlayback';

export function PlayerSurface({ pb, title }: Readonly<{ pb: Playback; title: string }>): ReactNode {
  // The chrome shrinks the stage into a rounded card when the settings panel
  // opens, and rounding the stage is not enough: <VideoView> is backed by an
  // AVPlayerLayer, which a rounded ancestor does NOT clip - the picture kept
  // square corners inside a rounded card. Clipping its own wrapper does.
  const radius = useSurfaceRadius();
  // The engine replaces its player on every re-anchor (a seek in master mode, a
  // direct->master fallback), so the surface reads it per render rather than
  // holding on to one instance.
  //
  // `surfaceNonce` is what makes "per render" mean anything: `engineRef` is a
  // ref, so replacing the player inside it changes nothing React can see, and
  // this view would happily go on rendering a player that has been released -
  // a black picture that never comes back, which is what every seek used to do.
  // It is read below, as the view's key.
  const engine = pb.engineRef.current as ExpoVideoEngine | null;
  const player = engine?.videoPlayer ?? null;
  if (!player) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <VideoView
        // Re-key on the player itself: expo-video's view binds its AVPlayer at
        // mount, so a swapped player needs a NEW view, not an updated prop.
        key={pb.surfaceNonce}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        // The app draws its own 10-foot chrome; the platform's controls would sit
        // on top of it and answer the remote first.
        nativeControls={false}
        accessibilityLabel={title}
      />
    </Animated.View>
  );
}
