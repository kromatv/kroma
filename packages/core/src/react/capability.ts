import type { KromaClient } from '@kromatv/client';
import type { Capabilities } from '@kromatv/client/capabilities';
import { useEffect, useMemo, useRef, useState } from 'react';

type CapabilityReader = Pick<KromaClient, 'capabilities' | 'sessionToken'>;

const NOTHING: Capabilities = {};

interface Asking {
  session: string | undefined;
  reading: Promise<Capabilities>;
}

const ASKING = new WeakMap<CapabilityReader, Asking>();

function ask(client: CapabilityReader, session: string | undefined): Promise<Capabilities> {
  const running = ASKING.get(client);
  if (running !== undefined && running.session === session) return running.reading;
  const entry: Asking = { session, reading: client.capabilities.read().catch(() => NOTHING) };
  ASKING.set(client, entry);
  void entry.reading.then(() => {
    if (ASKING.get(client) === entry) ASKING.delete(client);
  });
  return entry.reading;
}

/**
 * `undefined` until the map has been read, null where nothing answers it, so a
 * screen can tell "not yet" from "never". `open` is held from the first render,
 * so passing a fresh closure is safe and changing what it opens is not.
 */
export function useCapability<C extends CapabilityReader, T>(
  client: C | null,
  open: (client: C, capabilities: Capabilities) => T | null,
): T | null | undefined {
  const [read, setRead] = useState<{ session: string | undefined; map: Capabilities } | null>(null);
  const opener = useRef(open);
  opener.current = open;
  const session = client?.sessionToken;
  const answered = read !== null && read.session === session ? read.map : undefined;

  useEffect(() => {
    if (!client) return;
    let live = true;
    void ask(client, session).then((map) => {
      if (live) setRead({ session, map });
    });
    return () => {
      live = false;
    };
  }, [client, session]);

  return useMemo(() => {
    if (!client) return null;
    return answered === undefined ? undefined : opener.current(client, answered);
  }, [client, answered]);
}
