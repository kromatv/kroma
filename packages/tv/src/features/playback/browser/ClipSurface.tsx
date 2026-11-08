import type { ReactNode } from 'react';
import type { ClipSurfaceProps } from '#tv/features/playback/player/clipBackend';
import type { HtmlClipEngine } from '#tv/features/playback/player/htmlClipEngine';

const ROUNDED = { borderRadius: 'inherit' } as const;

/** The clip's picture on the browser targets: a plain `<video>` the clip engine
 * plays its file on. */
export function ClipSurface({
  clip: { attachVideo },
  title,
}: Readonly<ClipSurfaceProps<HtmlClipEngine>>): ReactNode {
  return (
    <video ref={attachVideo} playsInline aria-label={title} style={ROUNDED}>
      <track kind="captions" />
    </video>
  );
}
