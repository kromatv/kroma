// The video surface on the browser targets: which element it is depends on the
// backend the playback hook chose. PlayerSurface.tsx is the native half.

import { classes, style } from '@kromatv/ui/kit';
import { type ReactNode, useCallback, useState } from 'react';
import { useShellPip, useVideoPip } from '#tv/features/playback/browser/surfacePip';
import type { SurfaceProps } from '#tv/features/playback/player/playbackBackend';

const FILL = style({ width: '100%', height: '100%' });
export function PlayerSurface({ pb, title, pip }: Readonly<SurfaceProps>): ReactNode {
  const { surface, objectRef } = pb;
  if (surface === 'avplay') {
    // NO child text: AVPlay renders to a hardware plane, not into this <object>'s
    // box, so fallback children draw visibly over the video. aria-label carries
    // the accessible name without drawing anything.
    return (
      <object
        ref={objectRef}
        type="application/avplayer"
        className={classes(FILL)}
        aria-label={title}
      />
    );
  }
  if (surface === 'mpv') return <MpvSurface pb={pb} title={title} pip={pip} />;
  return <VideoSurface pb={pb} title={title} pip={pip} />;
}

function MpvSurface({ pb, title, pip }: Readonly<SurfaceProps>): ReactNode {
  useShellPip(pip, pb.aspect);
  return <div className={classes(FILL)} role="img" aria-label={title} />;
}

function VideoSurface({ pb, pip }: Readonly<SurfaceProps>): ReactNode {
  const { videoRef } = pb;
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const bind = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      setVideo(el);
    },
    [videoRef],
  );
  useVideoPip(pip, video);
  // Subtitles render through the shared SubtitleRenderer; the empty captions
  // track only satisfies the media-caption accessibility requirement.
  //
  // crossOrigin is REQUIRED for the audio filter: the TV shells load the app
  // from their own origin (file:// / tauri://) while media comes from the
  // server, and a non-CORS media element routed into Web Audio outputs SILENCE
  // (tainted). The server's CORS allowlist answers a document loaded off a
  // device, which is what keeps this element readable (server api/origin.rs).
  return (
    <video ref={bind} autoPlay playsInline crossOrigin="anonymous" style={ROUNDED}>
      <track kind="captions" />
    </video>
  );
}

const ROUNDED = { borderRadius: 'inherit' } as const;
