import { useRouter } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';

function keyOf(hash: string): string | null {
  try {
    return hash.length > 1 ? decodeURIComponent(hash.slice(1)) : null;
  } catch {
    return null;
  }
}

/** The message the address's `#key` names, following both a link's hash change and the router's own navigation; none on the server. */
export function useLinkedKey(): string | null {
  const router = useRouter();
  const hash = useSyncExternalStore(
    (change) => {
      const stop = router.history.subscribe(change);
      window.addEventListener('hashchange', change);
      return () => {
        stop();
        window.removeEventListener('hashchange', change);
      };
    },
    () => window.location.hash,
    () => '',
  );
  return keyOf(hash);
}
