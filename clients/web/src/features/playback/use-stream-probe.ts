import {
  type EngineDecision,
  fetchMaster,
  type PlayedStream,
  playedStream,
  streamRefusal,
} from '@kromatv/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlaybackSource } from '#web/features/playback/playback-source';
import type { StreamFailure } from '#web/features/playback/stream-failure';
import { kromaClient } from '#web/shared/lib/api';

interface ProbeInput {
  masterUrl: PlaybackSource['masterUrl'];
  decision: EngineDecision;
  anchor: number;
  audioIndex: number;
  booted: boolean;
  restartAt: (absSec: number) => void;
}

export interface StreamProbe {
  baseSec: number;
  srcReady: boolean;
  serverDurSec: number;
  played: PlayedStream | null;
  failure: StreamFailure | null;
  refused: (status: number, resumeAt?: number) => void;
  fail: (failure: StreamFailure) => void;
}

function numberHeader(r: Response, name: string): number {
  const raw = r.headers.get(name);
  return raw === null ? Number.NaN : Number(raw);
}

/**
 * Asks the server for the anchored master before anything is attached.
 * `-noaccurate_seek` cuts it at the keyframe at or before the anchor, so where
 * its clock starts is the server's answer (`X-Hls-Start`), and a stream it
 * refuses is refused here rather than inside an engine that would retry it
 * forever. A 401 renews the session, and with it the media ticket, once, then
 * asks again from `resumeAt` when the refusal came mid-film.
 */
export function useStreamProbe({
  masterUrl,
  decision,
  anchor,
  audioIndex,
  booted,
  restartAt,
}: ProbeInput): StreamProbe {
  const [baseSec, setBaseSec] = useState(0);
  const [srcReady, setSrcReady] = useState(false);
  const [serverDurSec, setServerDurSec] = useState(0);
  const [modeToken, setModeToken] = useState<string | null>(null);
  const [failure, setFailure] = useState<StreamFailure | null>(null);
  const [renewals, setRenewals] = useState(0);
  const renewed = useRef(false);

  const refused = useCallback(
    (status: number, resumeAt?: number) => {
      const refusal = streamRefusal(status);
      if (!refusal) return;
      if (refusal === 'denied' && !renewed.current) {
        renewed.current = true;
        void kromaClient()
          .refreshSession()
          .then((token) => {
            if (!token) {
              setFailure('denied');
              return;
            }
            if (resumeAt !== undefined) restartAt(resumeAt);
            setRenewals((n) => n + 1);
          });
        return;
      }
      setFailure(refusal);
    },
    [restartAt],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `renewals` is the retry trigger.
  useEffect(() => {
    if (!booted) return;
    setSrcReady(false);
    setFailure(null);
    setModeToken(null);
    if (decision.kind === 'direct') {
      setBaseSec(0);
      setSrcReady(true);
      return;
    }
    const abandoned = new AbortController();
    let cancelled = false;
    fetchMaster(masterUrl(decision.aacMaster, anchor, audioIndex), abandoned.signal)
      .then((r) => {
        if (cancelled) return;
        if (streamRefusal(r.status)) {
          refused(r.status);
          return;
        }
        renewed.current = false;
        const start = numberHeader(r, 'X-Hls-Start');
        const total = numberHeader(r, 'X-Media-Duration');
        setBaseSec(Number.isFinite(start) ? start : anchor);
        if (Number.isFinite(total) && total > 0) setServerDurSec(total);
        setModeToken(r.headers.get('X-Hls-Mode'));
        setSrcReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setBaseSec(anchor);
        setSrcReady(true);
      });
    return () => {
      cancelled = true;
      abandoned.abort();
    };
  }, [masterUrl, decision, anchor, audioIndex, booted, renewals, refused]);

  const played = useMemo(() => playedStream(modeToken), [modeToken]);
  return { baseSec, srcReady, serverDurSec, played, failure, refused, fail: setFailure };
}
