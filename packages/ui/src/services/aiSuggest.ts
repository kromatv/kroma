// Shared "Suggestions IA" poll loop behind each client's detail screen. The
// server generates the section lazily (LLM connector) and caches it, so the
// first calls return `null` (generating); we poll until a section arrives (its
// items may be empty, in which case the caller renders nothing) or we give up.
// The client is injected so web and TV share the exact same logic.

import type { KromaClient } from '@kromatv/client';
import type { ItemId, Section } from '@kromatv/client/media';
import { useEffect, useState } from 'react';

const POLL_MS = 6000;
const MAX_POLLS = 12;

export interface UseAiSuggestOptions {
  /** Gate polling (web waits for auth to hydrate). Default `true`. */
  active?: boolean;
}

export interface UseAiSuggestResult {
  /** The generated section once it arrives (items may be empty), else `null`. */
  section: Section | null;
  /** True once the server has answered that it is generating, until the section
   * lands or polling gives up; false before its first answer. */
  pending: boolean;
}

/**
 * Elapsed-time *estimate* (the LLM run is opaque) for a ring shown while a
 * section is pending: eases toward a 96% ceiling on an exponential curve so it
 * never reads "done" before the work arrives. τ=14s ⇒ ~90% at ~30s. Counts from
 * the caller's mount and re-renders it every 250ms, so call it from the ring's
 * own leaf rather than from the screen around it.
 */
export function useEstimatedProgress(): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setProgress(Math.min(0.96, 1 - Math.exp(-(Date.now() - start) / 14000)));
    }, 250);
    return () => clearInterval(id);
  }, []);
  return progress;
}

export function useAiSuggest(
  client: KromaClient,
  id: ItemId,
  { active = true }: UseAiSuggestOptions = {},
): UseAiSuggestResult {
  const [section, setSection] = useState<Section | null>(null);
  const [pending, setPending] = useState(false);
  const [seen, setSeen] = useState({ client, id, active });
  if (seen.client !== client || seen.id !== id || seen.active !== active) {
    setSeen({ client, id, active });
    if (active) {
      setSection(null);
      setPending(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      client.media
        .aiSuggest(id)
        .then((res) => {
          if (cancelled) return;
          if (res) {
            // Terminal: a section (possibly with empty items).
            setSection(res);
            setPending(false);
          } else if (tries < MAX_POLLS) {
            tries += 1;
            setPending(true);
            timer = setTimeout(poll, POLL_MS); // still generating
          } else {
            setPending(false); // gave up waiting
          }
        })
        .catch(() => {
          if (!cancelled) setPending(false);
        });
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, id, active]);

  return { section, pending };
}
