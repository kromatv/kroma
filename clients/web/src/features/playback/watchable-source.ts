import type { AudioTrack } from '@kromatv/client/media';
import type { WatchableApi, WatchableProbe, WatchableTicket } from '@kromatv/client/watchable';
import {
  capabilities,
  fileContainer,
  MSE_CAPS,
  SAFARI_CAPS,
  tracksNeedAac,
  tracksNotice,
  videoAspect,
  type WatchableTarget,
  watchableBufferPlan,
  watchableDeclaration,
} from '@kromatv/core';
import type { PlaybackSource } from '#web/features/playback/playback-source';

function audioOf({ audio }: WatchableProbe): AudioTrack[] {
  return audio.map((track, position) => ({ ...track, default: track.default ?? position === 0 }));
}

export function watchableSource({
  watchable,
  target,
  probe,
  ticket,
  title,
  startSec,
}: Readonly<{
  watchable: WatchableApi;
  target: WatchableTarget;
  probe: WatchableProbe;
  ticket: WatchableTicket;
  title: string;
  startSec: number;
}>): PlaybackSource {
  const { entry, file } = target;
  const declaration = watchableDeclaration(capabilities());
  const picture = probe.video;
  return {
    itemId: null,
    startSec,
    title,
    container: fileContainer(file.name),
    durationMs: probe.durationMs,
    video: picture,
    aspect: videoAspect(picture),
    audioTracks: audioOf(probe),
    sizeBytes: file.sizeBytes,
    directUrl: null,
    plan: watchableBufferPlan(file, probe.durationMs),
    masterUrl: (aac, startSec, audio) =>
      watchable.hlsMasterUrl({
        id: entry.id,
        file: file.index,
        token: ticket.token,
        aac,
        startSec,
        audio,
        declaration,
      }),
    decide: (env) => ({
      kind: 'web-mse',
      aacMaster: tracksNeedAac(probe.audio, env.safari ? SAFARI_CAPS : MSE_CAPS),
    }),
    notice: (mode) => tracksNotice(probe.audio, mode),
  };
}
