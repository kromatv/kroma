import type { ReactNode } from 'react';
import { ClipSurface } from '#tv/features/playback/browser/ClipSurface';
import type { ClipBackend } from '#tv/features/playback/player/clipBackend';
import { HtmlClipEngine } from '#tv/features/playback/player/htmlClipEngine';
import { TvTrailerPlayer } from '#tv/features/playback/TvTrailerPlayer';

const BROWSER_CLIP: ClipBackend<HtmlClipEngine> = {
  createClipEngine: ({ url, video, listeners }) =>
    video ? new HtmlClipEngine(video, url, listeners) : null,
  Surface: ClipSurface,
};

/** The trailer screen on the browser shells, on the page's own `<video>`. */
export function BrowserTrailer(): ReactNode {
  return <TvTrailerPlayer backend={BROWSER_CLIP} />;
}
