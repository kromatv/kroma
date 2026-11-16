import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { anyReading } from '#site/lib/sync-facts';
import type { SyncState } from '#site/lib/views';

const EVERY_MS = 3000;

/** Reload the page's data every three seconds for as long as one of `syncs` is reading, so a sync in progress shows its news. */
export function usePollWhileReading(syncs: readonly SyncState[]): void {
  const router = useRouter();
  const reading = anyReading(syncs);
  useEffect(() => {
    if (!reading) {
      return undefined;
    }
    const timer = setInterval(() => void router.invalidate(), EVERY_MS);
    return () => clearInterval(timer);
  }, [reading, router]);
}
