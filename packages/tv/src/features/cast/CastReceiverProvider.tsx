// This TV as a cast **receiver**: it tells the server it is here and what it is
// playing, and applies the orders a phone or a browser sends it.
//
// Mounted once, above the router, because a TV must be castable from its home
// screen - not only while a player happens to be on. It holds no state a screen
// reads, so it renders nothing and never re-renders the app: the heartbeat runs
// on a timer and reads the running player through the cast bridge.
//
// Orders arrive twice over on purpose: pushed live on the event bus, and
// returned by the next heartbeat until acked. Whichever lands first wins, and
// `lastAppliedSeq` makes the other a no-op - so a TV whose socket dropped in the
// middle of the film still gets the pause, one beat late instead of never.

import { type CastCommand, KromaEvents } from '@kroma/core';
import { useT } from '@kroma/ui';
import { type ReactNode, useEffect, useRef } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useEnv } from '#tv/app/providers/env';
import { useClient, useNav } from '#tv/app/router';
import { useStoredPref } from '#tv/app/settings/store';
import { applyCastCommand } from '#tv/features/cast/applyCommand';
import { castReport } from '#tv/features/cast/castBridge';
import { castReceiverPrefStore } from '#tv/features/cast/castPref';
import { receiverId } from '#tv/features/cast/receiverId';

/** How often the TV says "still here". The server drops a receiver after ~45 s
 * of silence, so this tolerates a couple of missed beats. */
const BEAT_MS = 10_000;
/** Slower cadence when nothing is playing: an idle TV only has to stay listed. */
const IDLE_BEAT_MS = 25_000;

export function CastReceiverProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = useClient();
  const nav = useNav();
  const t = useT();
  const { user } = useAuth();
  const { platform } = useEnv();
  const [castable] = useStoredPref(castReceiverPrefStore);

  // Everything the loop needs, read through a ref: the heartbeat must not
  // re-subscribe (or restart) every time the router or the player re-renders.
  const deps = useRef({ client, nav, t, platform });
  deps.current = { client, nav, t, platform };

  const applied = useRef(0);
  const signedIn = Boolean(user);

  useEffect(() => {
    if (!signedIn || castable === 'off') return;
    const id = receiverId();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Apply one order, newest wins; anything already applied is ignored. */
    const apply = async (seq: number, command: CastCommand) => {
      if (seq <= applied.current) return;
      applied.current = seq;
      await applyCastCommand(command, deps.current);
    };

    const beat = async () => {
      if (stopped) return;
      const playback = castReport(deps.current.t) ?? undefined;
      try {
        const reply = await deps.current.client.announceCast({
          receiverId: id,
          name: deviceName(deps.current.platform),
          platform: deps.current.platform,
          lastAppliedSeq: applied.current,
          playback,
        });
        for (const { seq, command } of reply.commands) await apply(seq, command);
      } catch {
        // A missed beat is not worth a screen: the next one re-registers this TV,
        // and the roster simply doesn't list it in between.
      }
      if (!stopped) timer = setTimeout(beat, playback ? BEAT_MS : IDLE_BEAT_MS);
    };

    // Live pushes. The server addresses cast commands to the account this TV is
    // signed into, so a foreign household's orders never reach this socket; the
    // receiver id then picks this device among that account's own.
    const events = new KromaEvents(client.baseUrl, {
      onEvent: (e) => {
        if (e.type === 'cast.command' && e.receiverId === id) void apply(e.seq, e.command);
      },
    });
    events.connect();
    void beat();

    return () => {
      stopped = true;
      clearTimeout(timer);
      events.close();
      // Leave the roster at once (sign-out, or the setting turned off) instead of
      // lingering as an offerable TV until the TTL expires.
      client.unregisterCast(id).catch(() => undefined);
    };
  }, [signedIn, castable, client]);

  return <>{children}</>;
}

/** What this TV calls itself in a picker. The platform label is the honest
 * default: TVs have no name to read, and typing one on a D-pad is a chore. The
 * profile it is signed into is shown next to it by the sender. */
function deviceName(platform: string): string {
  return platform && platform !== 'TV' ? platform : 'TV';
}
