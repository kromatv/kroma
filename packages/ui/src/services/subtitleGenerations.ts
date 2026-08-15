// Shared subtitle-generation poll loop, behind each client's player.

import type { KromaClient, SubtitleGeneration } from '@kroma/core';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

export interface SubtitleGenerationsOptions {
  active?: boolean;
  onComplete: (subId: string) => void;
}

export interface SubtitleGenerationsResult {
  generations: SubtitleGeneration[];
  cancel: (genId: string) => void;
  refresh: () => void;
}

// Module-level: the try/catch is a construct the React Compiler cannot lower
// inside a hook, and it would skip the whole poll loop over it.
async function pollOnce(at: {
  client: KromaClient;
  itemId: string;
  seenDone: Set<string>;
  isStopped: () => boolean;
  report: (list: SubtitleGeneration[]) => void;
  complete: (subId: string) => void;
  stop: () => void;
}): Promise<void> {
  try {
    const list = await at.client.subtitleGenerations(at.itemId);
    if (at.isStopped()) return;
    at.report(list);
    for (const g of list) {
      if (g.status === 'done' && g.subId && !at.seenDone.has(g.id)) {
        at.seenDone.add(g.id);
        at.complete(g.subId);
      }
    }
    const live = list.some((g) => g.status !== 'done' && g.status !== 'error');
    if (!live) at.stop();
  } catch {
    /* transient; next tick retries */
  }
}

export function useSubtitleGenerations(
  client: KromaClient,
  itemId: string,
  { active = true, onComplete }: SubtitleGenerationsOptions,
): SubtitleGenerationsResult {
  const [generations, setGenerations] = useState<SubtitleGeneration[]>([]);
  const [nudge, setNudge] = useState(0);
  const fireComplete = useEffectEvent((subId: string) => onComplete(subId));
  // The ids already reported done, per item. Reset inside the effect rather
  // than during render: the effect re-runs on an item change anyway, and the
  // set must survive a `nudge` or `active` re-run.
  const seenRef = useRef<{ itemId: string; seen: Set<string> } | null>(null);

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
    if (seenRef.current === null || seenRef.current.itemId !== itemId) {
      seenRef.current = { itemId, seen: new Set() };
    }
    const seenDone = seenRef.current.seen;
    const tick = () =>
      pollOnce({
        client,
        itemId,
        seenDone,
        isStopped: () => stopped,
        report: setGenerations,
        complete: (subId) => fireComplete(subId),
        stop,
      });
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
