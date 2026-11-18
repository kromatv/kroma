import type { KromaClient } from '@kromatv/client';
import type { UserId } from '@kromatv/client/accounts';
import { useEffect, useState } from 'react';
import type { MovieView } from '#web/shared/lib/api';

export interface ResumeAnchor {
  anchor: number;
  setAnchor: React.Dispatch<React.SetStateAction<number>>;
  bootAnchor: number | null;
}

/** Resolves the stored progress into the anchor the HLS master is remuxed from.
 * `bootAnchor` stays `null` until that resolution lands. */
export function useResumeAnchor(
  item: MovieView,
  client: KromaClient,
  viewer: UserId | null,
): ResumeAnchor {
  // The HLS master starts at `?t=anchor`; a resume/far/backward seek changes it,
  // remounting the <video>. `bootAnchor === null` means resume hasn't resolved
  // yet, so the source effect waits rather than attaching at 0 and re-anchoring.
  const [anchor, setAnchor] = useState(0);
  const [resolved, setResolved] = useState<{
    id: MovieView['id'];
    viewer: UserId;
    value: number;
  } | null>(null);
  const [seen, setSeen] = useState({ id: item.id, viewer });
  if (seen.id !== item.id || seen.viewer !== viewer) {
    setSeen({ id: item.id, viewer });
    if (!viewer) {
      setAnchor(0);
    }
  }
  const resolvedHere =
    resolved?.id === item.id && resolved.viewer === viewer ? resolved.value : null;
  const bootAnchor = viewer ? resolvedHere : 0;
  useEffect(() => {
    if (!viewer) {
      return undefined;
    }
    let cancelled = false;
    client.playback
      .itemProgress(item.id)
      .then((p) => {
        if (cancelled) {
          return;
        }
        const durMs = p?.durationMs ?? item.durationMs ?? 0;
        const posSec = (p?.positionMs ?? 0) / 1000;
        const resume = p && posSec > 15 && (!durMs || p.positionMs < durMs * 0.95) ? posSec : 0;
        setAnchor(resume);
        setResolved({ id: item.id, viewer, value: resume });
      })
      .catch(() => {
        if (!cancelled) {
          setAnchor(0);
          setResolved({ id: item.id, viewer, value: 0 });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, viewer, item.id, item.durationMs]);

  return { anchor, setAnchor, bootAnchor };
}
