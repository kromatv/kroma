// This TV as a cast **receiver**: it tells the server it is here and what it is
// playing, and applies the orders a phone or a browser sends it.
//
// Mounted once, above the router, because a TV must be castable from its home
// screen - not only while a player happens to be on. It holds no state a screen
// reads, so it renders nothing and never re-renders the app: it reads the
// running player through the cast bridge.
//
// It talks over the event socket it already holds, NOT a heartbeat. The TV says
// hello once, then sends a frame only when something changes - so a pause
// pressed on a phone shows up there at once instead of up to a beat later, and
// nothing is sent at all while a film simply plays. Presence is the connection
// itself: drop the socket and the set leaves every picker immediately, instead
// of lingering until a TTL expires.
//
// The HTTP path stays as the fallback for a socket that will not come up, and
// orders arriving twice (live push AND fallback reply) are deduped by seq.

import { type CastCommand, KromaEvents } from '@kroma/core';
import { useT } from '@kroma/ui';
import { type ReactNode, useEffect, useRef } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useEnv } from '#tv/app/providers/env';
import { useClient, useNav } from '#tv/app/router';
import { useStoredPref } from '#tv/app/settings/store';
import { applyCastCommand } from '#tv/features/cast/applyCommand';
import { castReport, onCastReportChange } from '#tv/features/cast/castBridge';
import { castReceiverPrefStore } from '#tv/features/cast/castPref';
import { receiverId } from '#tv/features/cast/receiverId';

/** Position keepalive while playing. Nothing else is sent between changes, so
 * this is only there to correct the drift of a sender's own interpolation. */
const DRIFT_MS = 20_000;
/** Fallback heartbeat, used only while the socket is down. */
const FALLBACK_BEAT_MS = 10_000;

export function CastReceiverProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = useClient();
  const nav = useNav();
  const t = useT();
  const { user } = useAuth();
  const { platform } = useEnv();
  const [castable] = useStoredPref(castReceiverPrefStore);

  // Everything the loop needs, read through a ref: the receiver must not
  // reconnect every time the router or the player re-renders.
  const deps = useRef({ client, nav, t, platform });
  deps.current = { client, nav, t, platform };

  const applied = useRef(0);
  const signedIn = Boolean(user);

  useEffect(() => {
    if (!signedIn || castable === 'off') return;
    const id = receiverId();
    let stopped = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let drift: ReturnType<typeof setInterval> | undefined;

    /** Apply one order, then tell the server so it stops resending it. */
    const apply = async (seq: number, command: CastCommand) => {
      if (seq <= applied.current) return;
      applied.current = seq;
      await applyCastCommand(command, deps.current);
      events.send({ type: 'cast.ack', seq });
    };

    /** Push what the player is doing. Called on change, not on a clock. */
    const pushState = () =>
      events.send({ type: 'cast.state', playback: castReport(deps.current.t) });

    /** The HTTP path: only while the socket is down. It re-registers this TV and
     * collects anything the push could not deliver. */
    const beat = async () => {
      if (stopped || events.open) {
        if (!stopped) fallback = setTimeout(beat, FALLBACK_BEAT_MS);
        return;
      }
      try {
        const reply = await deps.current.client.announceCast({
          receiverId: id,
          name: deviceName(deps.current.platform),
          platform: deps.current.platform,
          lastAppliedSeq: applied.current,
          playback: castReport(deps.current.t) ?? undefined,
        });
        for (const { seq, command } of reply.commands) await apply(seq, command);
      } catch {
        // A missed beat is not worth a screen: the next one re-registers this TV,
        // and the roster simply doesn't list it in between.
      }
      if (!stopped) fallback = setTimeout(beat, FALLBACK_BEAT_MS);
    };

    // The server addresses cast commands to the account this TV is signed into,
    // so another household's orders never reach this socket; the receiver id then
    // picks this device among that account's own.
    const events = new KromaEvents(client.baseUrl, {
      // Re-hello on every (re)connect: the server forgot this receiver the moment
      // the previous socket closed.
      onOpen: () => {
        events.send({
          type: 'cast.hello',
          receiverId: id,
          name: deviceName(deps.current.platform),
          platform: deps.current.platform,
        });
        pushState();
      },
      onEvent: (e) => {
        if (e.type === 'cast.command' && e.receiverId === id) void apply(e.seq, e.command);
      },
    });
    events.connect();

    // Push on change (the player re-renders ~4 Hz; only material changes send),
    // plus a slow position keepalive so a remote's scrubber cannot drift.
    const unsubscribe = onCastReportChange(pushState);
    drift = setInterval(() => {
      if (castReport(deps.current.t)) pushState();
    }, DRIFT_MS);
    void beat();

    return () => {
      stopped = true;
      unsubscribe();
      clearTimeout(fallback);
      clearInterval(drift);
      // Closing the socket is what unregisters this TV; the HTTP delete only
      // matters when the receiver came up through the fallback path.
      events.close();
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
