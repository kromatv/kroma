/** What the chrome renders about a film, declared here rather than imported from
 * a wire schema: the player is a design-system component and must not move when
 * a payload does. Each one is structurally what `@kromatv/client` sends, so an
 * app passes its parsed objects straight in.
 */

/** A stretch of the film the server recognised. */
export interface PlayerMarker {
  kind: 'intro' | 'credits';
  startMs: number;
  endMs: number;
}

/** One selectable audio track. */
export interface PlayerAudioTrack {
  index: number;
  codec: string;
  channels: number | null;
  language: string | null;
  title?: string | null;
  default: boolean;
}

/** The picture, as the stats panel reports it. */
export interface PlayerVideoTrack {
  codec: string;
  width: number | null;
  height: number | null;
  hdr: boolean;
  bitDepth: number | null;
}

/** What a viewer can report about the thing they are watching. */
export type PlayerReportCategory = 'metadata' | 'video' | 'audio' | 'subtitles' | 'other';

/** Which kinds of subtitle generation the server offers for this film. */
export interface PlayerSubCapabilities {
  transcribe: boolean;
  translate: boolean;
}

/** A subtitle generation the panel is following. `id` and `subId` are opaque to
 * the chrome, which only hands them back to the host's callbacks. */
export interface PlayerSubtitleGeneration {
  id: string;
  mode: 'transcribe' | 'translate';
  lang: string | null;
  stage: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  etaSec: number | null;
  error: string | null;
  subId: string | null;
}

/** The little the stats panel reads off the film itself. */
export interface PlayerStatsItem {
  title: string;
  container: string | null;
  video: PlayerVideoTrack | null;
}
