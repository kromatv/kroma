// The video surface, on the browser targets.
//
// Which element it is depends on the backend the playback hook chose: AVPlay
// renders to a hardware plane behind an <object> placeholder, mpv and the
// Android TV ExoPlayer bridge render to their own planes behind a transparent
// page, and the HTML engine plays into a real <video>. See PlayerSurface.tsx for
// the native half, which has exactly one surface.

import type { ReactNode } from 'react';
import type { Playback } from '#tv/features/playback/player/useDirectPlayback';

export function PlayerSurface({ pb, title }: Readonly<{ pb: Playback; title: string }>): ReactNode {
  if (pb.surface === 'avplay') {
    // NO child text: AVPlay renders the video to a hardware plane, not into this
    // <object>'s box, so any fallback children (the title, say) would render
    // VISIBLY over the plane: a static title stuck top-left on every file.
    // aria-label carries the accessible name without drawing anything.
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
  // track only satisfies the media-caption accessibility requirement. Fill and
  // object-fit come from the stylesheet the player injects for its stage;
  // borderRadius stays inline (guaranteed) so the remux shrink-card is rounded
  // on the legacy-tier build.
  //
  // crossOrigin is REQUIRED for the audio filter: the TV shells load the app
  // from their own origin (file:// / tauri://) while media comes from the
  // server, and a non-CORS media element routed into Web Audio outputs SILENCE
  // (tainted). The server replies permissive CORS, so this is safe.
  return (
    <video ref={pb.videoRef} autoPlay playsInline crossOrigin="anonymous" style={ROUNDED}>
      <track kind="captions" />
    </video>
  );
}

const ROUNDED = { borderRadius: 'inherit' } as const;
