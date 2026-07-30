// Registers this TV as a cast receiver: announces itself over the event
// socket and applies remote commands, with an HTTP polling fallback for
// when the socket won't come up. Renders nothing.

import { type CastCommand, type CastController, type KromaClient, KromaEvents } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Avatar, toast } from '@kroma/ui/kit';
import { type ReactNode, useEffect, useRef } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useEnv } from '#tv/app/providers/env';
import { useNav } from '#tv/app/router';
import { useStoredPref } from '#tv/app/settings/store';
import { applyCastCommand } from '#tv/features/cast/applyCommand';
import { castReport, onCastReportChange } from '#tv/features/cast/castBridge';
import { castReceiverPrefStore } from '#tv/features/cast/castPref';
import { setCastControllers, setCastUplink } from '#tv/features/cast/controllers';
import { receiverId } from '#tv/features/cast/receiverId';

const DRIFT_MS = 20_000;
const FALLBACK_BEAT_MS = 10_000;
const AUTH_TICK_MS = 100;
const AUTH_WAIT_TICKS = 50;

/** Mounts the cast receiver above the router so casting works even on the
 * signed-out picker; `client` is a prop (not `useClient()`) because it may
 * legitimately be null before a server is configured. */
export function CastReceiverProvider({
  client,
  children,
}: Readonly<{ client: KromaClient | null; children: ReactNode }>) {
  return (
    <>
      {client ? <CastReceiver client={client} /> : null}
      {children}
    </>
  );
}

function CastReceiver({ client }: Readonly<{ client: KromaClient }>) {
  const nav = useNav();
  const t = useT();
  const { user } = useAuth();
  const { platform } = useEnv();
  const [castable] = useStoredPref(castReceiverPrefStore);

  // Read through a ref so the effect below doesn't reconnect on every render.
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
    // Ack for `cast.hello` — set once the server broadcasts our row back. An
    // older server ignores the hello, so this stays false and the HTTP
    // fallback below takes over.
    let attached = false;

    const apply = async (seq: number, command: CastCommand) => {
      if (seq <= applied.current) return;
      applied.current = seq;
      await applyCastCommand(command, deps.current);
      events.send({ type: 'cast.ack', seq });
    };

    const announceJoins = (joined: CastController[]) => {
      for (const who of joined) {
        toast({
          message: deps.current.t('cast.remoteJoined', { user: who.username }),
          detail: who.name,
          icon: (
            <Avatar
              name={who.username}
              seed={who.username}
              size={40}
              roundness={0.35}
              src={deps.current.client.resolveArt(who.avatarUrl ?? undefined)}
            />
          ),
          tone: 'success',
        });
      }
    };

    const pushState = () =>
      events.send({ type: 'cast.state', playback: castReport(deps.current.t) });

    const beat = async () => {
      if (stopped || (events.open && attached)) {
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
        // Swallowed: the next beat re-registers this TV; the roster just
        // omits it meanwhile.
      }
      if (!stopped) fallback = setTimeout(beat, FALLBACK_BEAT_MS);
    };

    // Commands are addressed to the signed-in account, so another
    // household's orders never reach this socket.
    const events = new KromaEvents(client.baseUrl, {
      // Per-client bearer (multi-server), not the shared single-session
      // module web/phone use.
      token: () => deps.current.client.sessionToken,
      // The server forgets this receiver the moment its socket closes.
      onOpen: () => {
        events.send({
          type: 'cast.hello',
          receiverId: id,
          name: deviceName(deps.current.platform),
          platform: deps.current.platform,
        });
        pushState();
        // The top bar can now hang up on a remote: kicking one is a message on
        // this very socket.
        setCastUplink((message) => events.send(message));
      },
      onClose: () => {
        attached = false;
        // The remotes were driving us THROUGH that socket; with it gone the
        // server has already dropped them, so the top bar must not keep
        // advertising a list nothing can act on.
        setCastUplink(null);
      },
      onEvent: (e) => {
        if (e.type === 'cast.receiver' && e.receiver.id === id) {
          attached = true;
          announceJoins(setCastControllers(e.receiver.controllers));
        } else if (e.type === 'cast.receiver.gone' && e.receiverId === id) {
          attached = false;
          setCastControllers([]);
        } else if (e.type === 'cast.command' && e.receiverId === id) void apply(e.seq, e.command);
      },
    });
    // Wait for the bearer before opening anything: the stored user hydrates
    // synchronously but the session token is minted a moment later, and a
    // socket opened in that gap is refused. Capped, so a server that never
    // mints one still gets the retry loop.
    const whenAuthed = async () => {
      for (let i = 0; i < AUTH_WAIT_TICKS && !stopped; i++) {
        if (deps.current.client.hasAuth) return;
        await new Promise((r) => setTimeout(r, AUTH_TICK_MS));
      }
    };

    // Push on change (the player re-renders ~4 Hz; only material changes send),
    // plus a slow position keepalive so a remote's scrubber cannot drift.
    const unsubscribe = onCastReportChange(pushState);
    drift = setInterval(() => {
      if (castReport(deps.current.t)) pushState();
    }, DRIFT_MS);

    void whenAuthed().then(() => {
      if (stopped) return;
      events.connect();
      void beat();
    });

    return () => {
      stopped = true;
      unsubscribe();
      setCastUplink(null);
      clearTimeout(fallback);
      clearInterval(drift);
      // Closing the socket is what unregisters this TV; the HTTP delete only
      // matters when the receiver came up through the fallback path.
      events.close();
      client.unregisterCast(id).catch(() => undefined);
    };
  }, [signedIn, castable, client]);

  return null;
}

// TVs have no name to read and typing one on a D-pad is a chore, so the
// platform label is the honest default.
function deviceName(platform: string): string {
  return platform && platform !== 'TV' ? platform : 'TV';
}
