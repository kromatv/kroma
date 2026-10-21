import type { Query, RequestContext } from '../../core/client';
import { artworkUrls } from './artwork';
import type { ItemId } from './ids';
import type { HlsAudioFilter } from './tracks';

/** What this device can decode, for the HLS master builder.
 *
 * `copyCodecs` names the audio and `videoCodecs` the video, letting the server
 * override a stream copy it would play silent or black; omitted means no
 * declaration, an empty array means none. `copyCodecs` is read only for a copy
 * request, `videoCodecs` for every mode. `maxFrame` is the largest picture this
 * decoder accepts: a bigger source is fitted inside the nearest rung under it.
 * Both axes, because a scope frame breaks the width limit while clearing the
 * height one.
 *
 * `videoCodecs` carries ffprobe's codec names plus `h26410bit`, which is not a
 * codec: it says the decoder takes H.264 above 8 bits, since `h264` on its own
 * is read as the 8-bit 4:2:0 profile. */
export interface HlsMasterDeclaration {
  filter?: HlsAudioFilter;
  copyCodecs?: string[];
  videoCodecs?: string[];
  maxFrame?: { width: number; height: number };
}

const frame = (maxFrame?: { width: number; height: number }) =>
  maxFrame && maxFrame.width > 0 && maxFrame.height > 0
    ? { maxw: Math.round(maxFrame.width), maxh: Math.round(maxFrame.height) }
    : {};

/** The `?copy=&video=&maxw=&maxh=` a stream request carries: what this device can
 * decode, and the largest picture it accepts. An EMPTY codec list is itself a
 * declaration ("decode none"), which is why it is not the same as no list. */
export function streamQuery({ copyCodecs, videoCodecs, maxFrame }: HlsMasterDeclaration): Query {
  return { copy: copyCodecs, video: videoCodecs, ...frame(maxFrame) };
}

const forMode = (mode: string, declaration: HlsMasterDeclaration) =>
  mode === 'copy' ? declaration : { ...declaration, copyCodecs: undefined };

const ticket = (ctx: RequestContext): Query => ({ t: ctx.mediaTicket() });

/** The media members that answer at once: the URLs a player, an `<img>` or the
 * native downloader fetches itself. */
export default function mediaUrls(ctx: RequestContext) {
  return {
    artwork: artworkUrls(ctx),

    /** URL of the server's recent log lines (text/plain). */
    logsUrl: (tail = 200) => ctx.url('/logs', { query: { tail } }),

    /** Direct-play stream URL for a `<video>` src. Range requests are served.
     * Carries the account's media ticket, because the element fetching it cannot
     * send a header. */
    streamUrl: (id: ItemId) => ctx.url('/items/:id/stream', { params: { id }, query: ticket(ctx) }),

    /** One-file offline download: video stream-copied, every audio track copied
     * or AAC-transcoded server-side. `copyCodecs`/`videoCodecs` must distinguish
     * omitted (no preference, full copy set) from an empty array (decode none,
     * transcode everything) - collapsing the two would hand a device Dolby/AV1
     * tracks it can't decode with no fallback once offline. */
    downloadUrl: (id: ItemId, copyCodecs?: string[], videoCodecs?: string[]) =>
      ctx.url('/items/:id/download', {
        params: { id },
        query: streamQuery({ copyCodecs, videoCodecs }),
      }),

    /** HLS master playlist for one continuous remux, with the `audio` track muxed
     * in. `aac=true` transcodes it to stereo AAC for runtimes that can't decode the
     * source codec via MSE; `aac=false` stream-copies it. */
    hlsMasterUrl: (
      id: ItemId,
      aac = false,
      startSec = 0,
      audio = 0,
      declaration: HlsMasterDeclaration = {},
    ): string => {
      const clean = aac ? 'aac' : 'copy';
      const mode = declaration.filter ? `aac-${declaration.filter}` : clean;
      return ctx.url('/items/:id/hls/:mode/:anchor/:audio/index.m3u8', {
        params: {
          id,
          mode,
          anchor: Math.max(0, Math.round(startSec)),
          audio: Math.max(0, Math.round(audio)),
        },
        query: { ...streamQuery(forMode(mode, declaration)), ...ticket(ctx) },
      });
    },

    /** WebVTT URL for the n-th embedded subtitle track. The server extracts text
     * subtitles on demand. */
    subtitleUrl: (id: ItemId, index: number) =>
      ctx.url('/items/:id/subtitles/:index.vtt', { params: { id, index }, query: ticket(ctx) }),

    /** Manifest endpoint for an item's storyboard. */
    storyboardUrl: (id: ItemId) =>
      ctx.url('/items/:id/storyboard', { params: { id }, query: ticket(ctx) }),
  };
}
