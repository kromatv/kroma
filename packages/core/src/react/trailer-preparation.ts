import type { TrailerPreparation } from '@kromatv/client/trailers';
import { useEffect, useRef, useState } from 'react';

export type TrailerState = TrailerPreparation['status'];

const POLL_MS = 1000;

/** Follows one trailer from the press of its button to the moment it plays:
 * asks the server to fetch it, then asks again every second while it is
 * `preparing`. A request that fails reads as `failed`. `key` names the trailer,
 * and a new one starts over. */
export function useTrailerPreparation(
  prepare: () => Promise<TrailerPreparation>,
  key: string,
): TrailerState {
  const [answer, setAnswer] = useState<{ key: string; state: TrailerState } | null>(null);
  const prepareRef = useRef(prepare);
  useEffect(() => {
    prepareRef.current = prepare;
  });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = () => {
      prepareRef.current().then(
        ({ status }) => {
          if (cancelled) return;
          setAnswer({ key, state: status });
          if (status === 'preparing') timer = setTimeout(ask, POLL_MS);
        },
        () => {
          if (!cancelled) setAnswer({ key, state: 'failed' });
        },
      );
    };
    ask();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);
  return answer?.key === key ? answer.state : 'preparing';
}
