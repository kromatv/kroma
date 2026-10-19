import type { ItemId } from '@kromatv/client/media';
import { decodableVideoCodecs, type EngineDecision, streamRefusal } from '@kromatv/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamFailure } from '#web/features/playback/stream-failure';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

interface ProbeInput {
  itemId: ItemId;
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
  failure: StreamFailure | null;
  refused: (status: number, resumeAt?: number) => void;
  fail: (failure: StreamFailure) => void;
}

interface ProbeKey {
  booted: boolean;
  itemId: ItemId;
  decision: EngineDecision;
  anchor: number;
  audioIndex: number;
  renewals: number;
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
  itemId,
  decision,
  anchor,
  audioIndex,
  booted,
  restartAt,
}: ProbeInput): StreamProbe {
  const webRuntime = useWebRuntime();

  const [baseSec, setBaseSec] = useState(0);
  const [srcReady, setSrcReady] = useState(false);
  const [serverDurSec, setServerDurSec] = useState(0);
  const [failure, setFailure] = useState<StreamFailure | null>(null);
  const [renewals, setRenewals] = useState(0);
  const renewed = useRef(false);

  const refused = useCallback(
    (status: number, resumeAt?: number) => {
      const refusal = streamRefusal(status);
      if (!refusal) return;
      if (refusal === 'denied' && !renewed.current) {
        renewed.current = true;
        void webRuntime.client.refreshSession().then((token) => {
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
    [restartAt, webRuntime.client.refreshSession],
  );

  const [seen, setSeen] = useState<ProbeKey | null>(null);
  if (
    seen?.booted !== booted ||
    seen.itemId !== itemId ||
    seen.decision !== decision ||
    seen.anchor !== anchor ||
    seen.audioIndex !== audioIndex ||
    seen.renewals !== renewals
  ) {
    setSeen({ booted, itemId, decision, anchor, audioIndex, renewals });
    if (booted) {
      const direct = decision.kind === 'direct';
      setSrcReady(direct);
      setFailure(null);
      if (direct) setBaseSec(0);
    }
  }

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- `renewals` is the retry trigger.
  useEffect(() => {
    if (!booted || decision.kind === 'direct') return;
    let cancelled = false;
    const url = webRuntime.client.media.hlsMasterUrl(
      itemId,
      decision.aacMaster,
      anchor,
      audioIndex,
      {
        videoCodecs: decodableVideoCodecs(),
      },
    );
    fetch(url)
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
        setSrcReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setBaseSec(anchor);
        setSrcReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, decision, anchor, audioIndex, booted, renewals, refused]);

  return { baseSec, srcReady, serverDurSec, failure, refused, fail: setFailure };
}
