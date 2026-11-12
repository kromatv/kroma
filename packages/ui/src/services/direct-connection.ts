import type { KromaClient } from '@kromatv/client';
import {
  type DirectConnection,
  type DirectOutcome,
  type DirectState,
  startDirectConnection,
} from '@kromatv/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { lanPermission, onOnline, withLocalAddressSpace } from '../lib/lan-reach';
import { useForeground } from '../lib/use-foreground';

/** What a shell knows about its network that the engine cannot ask itself:
 * `onNetworkChange` subscribes to the device changing networks (wifi to
 * cellular, a new access point). A browser's `online` event is already heard.
 * Keep it stable across renders. */
export interface DirectPlatform {
  onNetworkChange?: (listener: () => void) => () => void;
}

/** The direct route as the screen sees it, with `connectNow` for the person
 * asking for it (raising the browser's prompt where there is one) and
 * `recheck` for a shell that knows the server came back. */
export interface DirectConnectionView extends DirectState {
  connectNow(): Promise<DirectOutcome>;
  recheck(): void;
}

const NOT_YET: DirectState = { askable: false };

/** Keeps `client` on a direct route to its server across this network while
 * one can be proved, for as long as someone is signed in. Asks again on
 * sign-in, on coming back to the foreground, when the device is back online or
 * changed networks, and every few minutes while on the configured base. */
export function useDirectConnection(
  client: KromaClient | null,
  signedIn: boolean,
  platform: DirectPlatform = {},
): DirectConnectionView {
  const inFront = useForeground();
  const connection = useRef<DirectConnection | null>(null);
  const [reported, setReported] = useState<{ client: KromaClient; state: DirectState } | null>(
    null,
  );

  useEffect(() => {
    if (!client) return;
    const started = startDirectConnection(client, {
      fetch: withLocalAddressSpace(globalThis.fetch.bind(globalThis)),
      permission: lanPermission,
      onChange: (state) => setReported({ client, state }),
    });
    connection.current = started;
    return () => {
      started.stop();
      connection.current = null;
    };
  }, [client]);

  useEffect(() => connection.current?.setSignedIn(signedIn), [client, signedIn]);
  useEffect(() => connection.current?.setForeground(inFront), [client, inFront]);
  useEffect(() => {
    if (!client) return;
    const recheck = () => connection.current?.recheck();
    const stopOnline = onOnline(recheck);
    const stopNetwork = platform.onNetworkChange?.(recheck);
    return () => {
      stopOnline();
      stopNetwork?.();
    };
  }, [client, platform.onNetworkChange]);

  const state = reported?.client === client ? reported.state : NOT_YET;
  return useMemo(
    () => ({
      ...state,
      connectNow: () => connection.current?.connectNow() ?? Promise.resolve({ kind: 'unknown' }),
      recheck: () => connection.current?.recheck(),
    }),
    [state],
  );
}
