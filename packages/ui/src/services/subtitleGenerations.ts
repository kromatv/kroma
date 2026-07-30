// Shared subtitle-generation poll loop, behind each client's player.

import type { KromaClient, SubtitleGeneration } from '@kroma/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SubtitleGenerationsOptions {
  active?: boolean;
  onComplete: (subId: string) => void;
}

export interface SubtitleGenerationsResult {
  generations: SubtitleGeneration[];
  cancel: (genId: string) => void;
  refresh: () => void;
}

export function useSubtitleGenerations(
  client: KromaClient,
  itemId: string,
  { active = true, onComplete }: SubtitleGenerationsOptions,
): SubtitleGenerationsResult {
  const [generations, setGenerations] = useState<SubtitleGeneration[]>([]);
  const [nudge, setNudge] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const seenDoneRef = useRef<Set<string>>(new Set());
  const itemRef = useRef(itemId);
  if (itemRef.current !== itemId) {
    itemRef.current = itemId;
    seenDoneRef.current = new Set();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: `nudge` is a trigger dep, not read in the body; bumping it via refresh() re-arms polling after a new generation is kicked off.
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let iv: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (iv) {
        clearInterval(iv);
        iv = null;
      }
    };
    const seenDone = seenDoneRef.current;
    const tick = async () => {
      try {
        const list = await client.subtitleGenerations(itemId);
        if (stopped) return;
        setGenerations(list);
        for (const g of list) {
          if (g.status === 'done' && g.subId && !seenDone.has(g.id)) {
            seenDone.add(g.id);
            onCompleteRef.current(g.subId);
          }
        }
        const live = list.some((g) => g.status !== 'done' && g.status !== 'error');
        if (!live) stop();
      } catch {
        /* transient; next tick retries */
      }
    };
    void tick();
    iv = setInterval(() => void tick(), 1500);
    return () => {
      stopped = true;
      stop();
    };
  }, [client, itemId, active, nudge]);

  const cancel = useCallback(
    (genId: string) => {
      setGenerations((prev) => prev.filter((g) => g.id !== genId));
      void client.cancelGeneration(itemId, genId).catch(() => undefined);
    },
    [client, itemId],
  );

  const refresh = useCallback(() => setNudge((n) => n + 1), []);

  return { generations, cancel, refresh };
}
