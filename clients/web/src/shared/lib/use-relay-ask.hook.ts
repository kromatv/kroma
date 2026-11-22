import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';

/** Where asking the relay to allow this server got: the relay's question went
 * to `to`, the server turned out to be allowed already, or it failed. */
export type RelayAsk =
  | { kind: 'asked'; to: string }
  | { kind: 'allowed' }
  | { kind: 'failed'; reason: string };

/** Asks the kroma.tv relay to let this server send, through the owner's own
 * address: the relay's question goes there, and the owner allows the server
 * from it. */
export function useRelayAsk() {
  const t = useT();
  const { client } = useAuth();
  const [asking, setAsking] = useState(false);
  const [ask, setAsk] = useState<RelayAsk | null>(null);
  const run = async () => {
    setAsking(true);
    try {
      const probe = await client.admin.testRelay();
      setAsk(probe.asked ? { kind: 'asked', to: probe.sentTo } : { kind: 'allowed' });
    } catch (cause) {
      setAsk({ kind: 'failed', reason: apiErrorText(cause, t('admin.relayTestFailed')) });
    } finally {
      setAsking(false);
    }
  };
  return { asking, ask, run };
}
