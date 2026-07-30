// The native half of the video surface; see PlayerSurface.web.tsx for the other.

import { useSurfaceRadius } from '@kroma/ui';
import { VideoView } from 'expo-video';
import type { ReactNode } from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { ExpoVideoEngine } from '#tv/features/playback/player/expoVideoEngine';
import type { Playback } from '#tv/features/playback/player/useDirectPlayback';

export function PlayerSurface({ pb, title }: Readonly<{ pb: Playback; title: string }>): ReactNode {
  // <VideoView> is backed by an AVPlayerLayer, which a rounded ancestor does
  // NOT clip; only clipping its own wrapper rounds the picture.
  const radius = useSurfaceRadius();
  // The engine replaces its player on every re-anchor, and `engineRef` is a ref,
  // so `surfaceNonce` is what tells React to render the new one.
  const engine = pb.engineRef.current as ExpoVideoEngine | null;
  const player = engine?.videoPlayer ?? null;
  if (!player) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <VideoView
        // expo-video binds its AVPlayer at mount: a swapped player needs a new view.
        key={pb.surfaceNonce}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        // The platform's controls would answer the remote before our chrome.
        nativeControls={false}
        accessibilityLabel={title}
      />
    </Animated.View>
  );
}
