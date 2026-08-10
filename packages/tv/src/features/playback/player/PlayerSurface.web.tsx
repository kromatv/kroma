// The video surface on the browser targets: which element it is depends on the
// backend the playback hook chose. PlayerSurface.tsx is the native half.

import type { ReactNode } from 'react';
import type { Playback } from '#tv/features/playback/player/useDirectPlayback';

export function PlayerSurface({ pb, title }: Readonly<{ pb: Playback; title: string }>): ReactNode {
  if (pb.surface === 'avplay') {
    // NO child text: AVPlay renders to a hardware plane, not into this <object>'s
    // box, so fallback children draw visibly over the video. aria-label carries
    // the accessible name without drawing anything.
    return (
      <object
        ref={pb.objectRef}
        type="application/avplayer"
        style={{ width: '100%', height: '100%' }}
        aria-label={title}
      />
    );
  }
  if (pb.surface === 'mpv') {
    return <div style={{ width: '100%', height: '100%' }} role="img" aria-label={title} />;
  }
  // Subtitles render through the shared SubtitleRenderer; the empty captions
  // track only satisfies the media-caption accessibility requirement.
  //
  // crossOrigin is REQUIRED for the audio filter: the TV shells load the app
  // from their own origin (file:// / tauri://) while media comes from the
  // server, and a non-CORS media element routed into Web Audio outputs SILENCE
  // (tainted). The server's CORS allowlist answers a document loaded off a
  // device, which is what keeps this element readable (server api/origin.rs).
  return (
    <video ref={pb.videoRef} autoPlay playsInline crossOrigin="anonymous" style={ROUNDED}>
      <track kind="captions" />
    </video>
  );
}

const ROUNDED = { borderRadius: 'inherit' } as const;
