import type { ReactNode } from 'react';
import { ClipSurface } from '#tv/features/playback/browser/clip-surface';
import type { ClipBackend } from '#tv/features/playback/player/clip-backend';
import { HtmlClipEngine } from '#tv/features/playback/player/html-clip-engine';
import { TvTrailerPlayer } from '#tv/features/playback/tv-trailer-player';

const BROWSER_CLIP: ClipBackend<HtmlClipEngine> = {
  createClipEngine: ({ url, video, listeners }) =>
    video ? new HtmlClipEngine(video, url, listeners) : null,
  Surface: ClipSurface,
};

/** The trailer screen on the browser shells, on the page's own `<video>`. */
export function BrowserTrailer(): ReactNode {
  return <TvTrailerPlayer backend={BROWSER_CLIP} />;
}
