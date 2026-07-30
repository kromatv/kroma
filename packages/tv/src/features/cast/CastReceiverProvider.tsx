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

/** Position keepalive while playing. Nothing else is sent between changes, so
 * this is only there to correct the drift of a sender's own interpolation. */
const DRIFT_MS = 20_000;
/** Fallback heartbeat, used only while the socket is down. */
const FALLBACK_BEAT_MS = 10_000;
/** How long to wait for the boot token exchange before opening the socket anyway. */
const AUTH_TICK_MS = 100;
const AUTH_WAIT_TICKS = 50;

/**
 * Mounts the receiver once there is a server to talk to, and is otherwise out of
 * the way.
 *
 * It sits ABOVE the router, so it renders on the signed-out picker too - and a
 * fresh install (no server saved yet) has no client there at all. Asking for one
 * with `useClient()` threw, and a throw this high in the tree is not one screen
 * failing: React unmounts everything, so first launch was a black screen instead
 * of the profile picker.
 *
 * So the client arrives as a PROP, the way `AuthProvider` and `LocaleProvider`
 * beside it already take it. Above the router, "there may be no client yet" is
 * the normal case, and a prop says so at the call site.
 */
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
    // Whether the SOCKET actually got us onto the roster. The server answers a
    // `cast.hello` by broadcasting our row, so hearing our own id back is the
    // acknowledgement. A server older than this client ignores the hello
    // entirely - and since the socket is open and healthy, nothing would ever
    // fall back and the TV would simply never appear in any picker.
    let attached = false;

    /** Apply one order, then tell the server so it stops resending it. */
    const apply = async (seq: number, command: CastCommand) => {
      if (seq <= applied.current) return;
      applied.current = seq;
      await applyCastCommand(command, deps.current);
      events.send({ type: 'cast.ack', seq });
    };

    /** Say hello on screen when a phone or a browser picks up this TV's remote.
     *
     * The notice names the PERSON and shows their face, because that is what
     * somebody in the room needs to decide whether to let it happen - "Chrome
     * connected" tells them nothing. The device is the second line. */
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

    /** Push what the player is doing. Called on change, not on a clock. */
    const pushState = () =>
      events.send({ type: 'cast.state', playback: castReport(deps.current.t) });

    /** The HTTP path: while the socket is down, or up but not carrying us. It
     * re-registers this TV and collects anything the push could not deliver. */
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
        // A missed beat is not worth a screen: the next one re-registers this TV,
        // and the roster simply doesn't list it in between.
      }
      if (!stopped) fallback = setTimeout(beat, FALLBACK_BEAT_MS);
    };

    // The server addresses cast commands to the account this TV is signed into,
    // so another household's orders never reach this socket; the receiver id then
    // picks this device among that account's own.
    const events = new KromaEvents(client.baseUrl, {
      // The TV holds its bearer on the client (multi-server: one per remembered
      // KROMA), not in the shared single-session module the web and phone use.
      token: () => deps.current.client.sessionToken,
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
    // Wait for the bearer before opening anything. The stored user hydrates
    // synchronously on launch but the session token is minted a moment later, and
    // a socket opened in that gap is refused - which costs two failed handshakes
    // and the exponential backoff they earn. That is the difference between this
    // TV being castable as its home screen appears and several seconds after.
    // Capped, so a server that never mints one still gets the retry loop.
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

/** What this TV calls itself in a picker. The platform label is the honest
 * default: TVs have no name to read, and typing one on a D-pad is a chore. The
 * profile it is signed into is shown next to it by the sender. */
function deviceName(platform: string): string {
  return platform && platform !== 'TV' ? platform : 'TV';
}
