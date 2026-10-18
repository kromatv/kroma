import { KromaEvents, type ServerEvent } from '@kromatv/client/events';
import { useEffect } from 'react';
import { useKromaClient } from './web-runtime';

/** Keep an owner-bound event subscription alive for a queue's update event. */
export function useServerUpdate(type: ServerEvent['type'], reload: () => void): void {
  const client = useKromaClient();
  useEffect(() => {
    const events = new KromaEvents(client.baseUrl, {
      token: () => client.sessionToken,
      refresh: () => client.refreshSession(),
      onEvent: (event) => {
        if (event.type === type) reload();
      },
    });
    events.connect();
    return () => events.close();
  }, [client, type, reload]);
}
