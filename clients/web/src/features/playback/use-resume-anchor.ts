import type { KromaClient, User } from '@kroma/core';
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
  user: User | null,
): ResumeAnchor {
  // The HLS master starts at `?t=anchor`; a resume/far/backward seek changes it,
  // remounting the <video>. `bootAnchor === null` means resume hasn't resolved
  // yet, so the source effect waits rather than attaching at 0 and re-anchoring.
  const [anchor, setAnchor] = useState(0);
  const [bootAnchor, setBootAnchor] = useState<number | null>(null);
  useEffect(() => {
    setBootAnchor(null);
    if (!user) {
      setAnchor(0);
      setBootAnchor(0);
      return;
    }
    let cancelled = false;
    client
      .itemProgress(item.id)
      .then((p) => {
        if (cancelled) return;
        const durMs = p?.durationMs ?? item.durationMs ?? 0;
        const posSec = (p?.positionMs ?? 0) / 1000;
        const resume = p && posSec > 15 && (!durMs || p.positionMs < durMs * 0.95) ? posSec : 0;
        setAnchor(resume);
        setBootAnchor(resume);
      })
      .catch(() => {
        if (!cancelled) {
          setAnchor(0);
          setBootAnchor(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, user, item.id, item.durationMs]);

  return { anchor, setAnchor, bootAnchor };
}
