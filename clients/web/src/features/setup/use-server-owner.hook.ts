import { useEffect, useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';

/** Whether the server has an account yet. `unknown` until it has answered, and
 * for a server that did not answer, which is never read as an empty one. */
export type ServerOwner = 'unknown' | 'missing' | 'present';

/** Asks the server once whether anybody owns it. */
export function useServerOwner(): ServerOwner {
  const { client } = useAuth();
  const [owner, setOwner] = useState<ServerOwner>('unknown');
  useEffect(() => {
    let cancelled = false;
    client.accounts.config().then(
      ({ hasAccounts }) => {
        if (!cancelled) {
          setOwner(hasAccounts ? 'present' : 'missing');
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [client]);
  return owner;
}
