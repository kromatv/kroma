// Publishes this TV's handoff beacon for as long as it is signed out, and signs
// in the moment a phone on the same network grants it an account.
//
// Mounted above the router, like the cast receiver: the beacon has to be up on
// whichever gate screen the TV happens to be showing, not only on the one that
// mentions it. Renders nothing.
//
// The beacon goes up at the server always, and on this television's own link
// when the shell handed a stack in to publish with (see TvApp's `lan`).

import {
  type HandoffBeaconHandle,
  type HandoffBeaconView,
  type KromaClient,
  type LanDiscoveryBridge,
  startHandoff,
} from '@kroma/core';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { useEnv } from '#tv/app/providers/env';
import { HandoffBeaconContext } from '#tv/app/providers/handoffBeacon';
import { deviceId } from '#tv/shared/device';

export function HandoffBeaconProvider({
  client,
  lan,
  name,
  children,
}: Readonly<{
  client: KromaClient | null;
  lan?: LanDiscoveryBridge;
  name: string;
  children: ReactNode;
}>) {
  const [beacon, setBeacon] = useState<HandoffBeaconView | null>(null);
  const { user, login } = useAuth();
  const { activeServerUrl } = useConnection();
  const { platform } = useEnv();
  const signedIn = Boolean(user);
  const running = useRef<HandoffBeaconHandle | null>(null);

  // A new name is a rename, not a restart: the loop retires the beacon already
  // out there in the same announce, where tearing the loop down and standing it
  // up again would blank the screen's check string and go through a moment with
  // nothing on the link at all.
  const latest = useRef(name);
  latest.current = name;

  useEffect(() => {
    // Only a signed-out TV waits: once there is an account, the beacon has done
    // its job and would only offer a second one.
    if (!client || !activeServerUrl || signedIn) {
      setBeacon(null);
      return;
    }
    const handoff = startHandoff({
      client,
      deviceId: deviceId(),
      name: latest.current,
      platform,
      publish: lan?.publish,
      onBeacon: setBeacon,
      onAuthenticated: (result) => login(result, activeServerUrl),
    });
    running.current = handoff;
    return () => {
      running.current = null;
      handoff.stop();
    };
  }, [client, activeServerUrl, signedIn, platform, login, lan]);

  useEffect(() => {
    running.current?.rename(name);
  }, [name]);

  return <HandoffBeaconContext.Provider value={beacon}>{children}</HandoffBeaconContext.Provider>;
}
