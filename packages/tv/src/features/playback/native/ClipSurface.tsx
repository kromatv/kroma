import { useSurfaceRadius } from '@kromatv/ui';
import { style } from '@kromatv/ui/kit';
import { VideoView } from 'expo-video';
import type { ReactNode } from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { ClipSurfaceProps } from '#tv/features/playback/player/clipBackend';
import type { ExpoClipEngine } from '#tv/features/playback/player/expoClipEngine';

const CLIP = style({ overflow: 'hidden' });

/** The clip's picture on the native shells: expo-video's view over the clip
 * engine's player, clipped to the stage's corners like the film's. */
export function ClipSurface({
  clip,
  title,
}: Readonly<ClipSurfaceProps<ExpoClipEngine>>): ReactNode {
  const radius = useSurfaceRadius();
  const player = clip.engineRef.current?.player ?? null;
  if (!player) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, CLIP, { borderRadius: radius }]}>
      <VideoView
        key={clip.surfaceNonce}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        surfaceType="textureView"
        nativeControls={false}
        accessibilityLabel={title}
      />
    </Animated.View>
  );
}
