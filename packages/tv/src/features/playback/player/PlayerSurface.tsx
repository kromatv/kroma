// The native half of the video surface; see PlayerSurface.web.tsx for the other.

import { type SurfaceRadius, useSurfaceRadius } from '@kroma/ui';
import { VideoView } from 'expo-video';
import type { ReactNode } from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { ExpoVideoEngine } from '#tv/features/playback/player/expoVideoEngine';
import type { Playback } from '#tv/features/playback/player/useDirectPlayback';
import type { VlcEngine } from '#tv/features/playback/player/vlcEngine';
import { getVlcPlane } from '#tv/features/playback/player/vlcPlane';

export function PlayerSurface({ pb, title }: Readonly<{ pb: Playback; title: string }>): ReactNode {
  // <VideoView> is backed by an AVPlayerLayer, which a rounded ancestor does
  // NOT clip; only clipping its own wrapper rounds the picture.
  const radius = useSurfaceRadius();
  if (pb.surface === 'vlc') return <VlcSurface pb={pb} title={title} radius={radius} />;
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
        // Android only, and load-bearing: Media3's default SurfaceView is composited
        // from its own window, so a rounded parent does not clip it and the settings
        // card's transform never reaches it - it punched a hole through the card and
        // left the picture black. A TextureView draws inside the view hierarchy. The
        // cost is HDR passthrough, which no card-shaped SurfaceView was delivering.
        surfaceType="textureView"
        // The platform's controls would answer the remote before our chrome.
        nativeControls={false}
        accessibilityLabel={title}
      />
    </Animated.View>
  );
}

// libVLC binds to its own surface, so unlike <VideoView> the plane IS the player:
// the engine cannot exist without it, and every event arrives here first.
function VlcSurface({
  pb,
  title,
  radius,
}: Readonly<{ pb: Playback; title: string; radius: SurfaceRadius }>): ReactNode {
  const Plane = getVlcPlane();
  const current = pb.engineRef.current;
  // `surface` flips to vlc a render before the engine is rebuilt, so the ref still
  // holds the outgoing player here. Checking the KIND rather than casting is what
  // keeps that render from reading a source the old engine does not have.
  const engine = current?.kind === 'vlc' ? (current as VlcEngine) : null;
  if (!Plane || !engine) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Plane
        sourceUri={engine.source.uri}
        startMs={engine.source.startMs}
        {...engine.viewState}
        style={StyleSheet.absoluteFill}
        accessibilityLabel={title}
        onPlayerTime={(e) => {
          const { timeMs, lengthMs, lostPictures, displayedPictures, inputBitrate } = e.nativeEvent;
          if (lostPictures != null && displayedPictures != null && inputBitrate != null) {
            engine.reportStats({ lostPictures, displayedPictures, inputBitrate });
          }
          engine.reportTime(timeMs, lengthMs);
        }}
        onPlayerLoad={(e) => engine.reportTime(0, e.nativeEvent.lengthMs)}
        onPlayerState={(e) => engine.reportState(e.nativeEvent.state, e.nativeEvent.percent)}
        onPlayerError={() => engine.reportError()}
      />
    </Animated.View>
  );
}
