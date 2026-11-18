// Assets and timings for the KROMA brand film; the tagline's animation is in
// `animations.ts`.

// The browser plays the first source it can decode: the 4K60 HEVC master, else
// a 720p60 H.264 encode every engine without HEVC decodes
// (docs/reference/intro-film-codecs.md). Each `type` is read from the file's
// hvcC/avcC box, so a re-encode re-reads it (keep `-movflags +faststart`).
export const VIDEO_SOURCES = [
  {
    src: new URL('../../../assets/kroma-intro-hevc.mp4', import.meta.url).href,
    type: 'video/mp4; codecs="hvc1.1.6.L153.90, mp4a.40.2"',
  },
  {
    src: new URL('../../../assets/kroma-intro-h264.mp4', import.meta.url).href,
    type: 'video/mp4; codecs="avc1.640020, mp4a.40.2"',
  },
] as const;

// Not `inset`, which is Chromium 87: below it the intro's layers cover nothing.
export const PINNED = { top: 0, right: 0, bottom: 0, left: 0 } as const;

// The safety window until the film's metadata gives its length.
export const SAFETY_MS = 5400;
export { EXIT_MS, SAFETY_SLACK_MS } from '#ui/lib/intro-timing';

// A hidden page gets its safety window re-checked rather than spent, so a tab
// parked in the background still opens on the film. Bounded, because a webview
// that reports itself hidden while it is on screen never fires the
// `visibilitychange` that would end the wait, and the intro covers the app.
export const HIDDEN_RECHECKS = 3;
