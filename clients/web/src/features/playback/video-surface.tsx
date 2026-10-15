import { classes, styles } from '@kromatv/ui/kit';
import type { VideoPlayback } from '#web/features/playback/video-engine';

const s = styles({ inheritCorner: { borderRadius: 'inherit' } });

/** Keyed by anchor and audio track: a seek past the buffer or a language change
 * is a fresh stream on a fresh element. */
export function VideoSurface({
  pb,
}: Readonly<{ pb: Pick<VideoPlayback, 'videoRef' | 'anchor' | 'audioIndex'> }>) {
  return (
    <video
      key={`${pb.anchor}:${pb.audioIndex}`}
      ref={pb.videoRef}
      playsInline
      crossOrigin="anonymous"
      className={classes(s.inheritCorner)}
    >
      {/* Empty track satisfies the captions requirement; SubtitleRenderer renders cues out-of-band. */}
      <track kind="captions" />
    </video>
  );
}
