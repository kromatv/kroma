// Shared playback-session heartbeat, behind each client's player. It pings the
// server every 10 s (so the stream shows in the admin "En cours de lecture"
// panel), promptly on play/pause, signals stop on unmount, and listens for an
// admin "terminate" event (or a 410 on the next ping) to halt with a message.
//
// All platform-specific bits are injected: the web wrapper supplies browser-UA
// labels + an offset-aware position and drives the prompt ping off its React
// `playing` state; the TV player supplies platform labels + the raw <video> and
// drives the prompt ping off the element's play/pause events.

import {
  type ItemId,
  KromaApiError,
  type KromaClient,
  KromaEvents,
  PlaybackSessionId,
} from '@kroma/core';
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';

export interface PlaybackHeartbeatParams {
  client: KromaClient;
  /** Gates pinging (web: signed-in; TV: `client.hasAuth`). */
  enabled: boolean;
  itemId: ItemId;
  durationMs: number | null;
  /** Absolute current position in seconds (offset-aware on the web seamless stream). */
  getPosition: () => number;
  /** Absolute position the surface has buffered up to, in seconds, where it can
   * say. Omitted from the ping when absent or undefined. */
  getBuffered?: () => number | undefined;
  /** The current transport state (`buffering` = playing but stalled/rebuffering). */
  getState: () => 'playing' | 'paused' | 'buffering';
  /** Label of the audio track the viewer has selected (omit → keep server default). */
  getAudio?: () => string | undefined;
  /** Label of the selected subtitle track, or an "off" label (omit → unchanged). */
  getSubtitle?: () => string | undefined;
  mode: 'direct' | 'remux' | 'transcode';
  player: string;
  device: string;
  /** Base URL for the live-events stream (web: apiBase(); TV: client.baseUrl). */
  eventsBaseUrl: string;
  /** Where the event socket reads its bearer, when the shared in-memory session
   * is not the right source. The TV keeps its bearer on its client (it is
   * multi-server), so it passes that; web and phone leave this unset. Without it
   * the TV's socket handshake carries no credential and is refused - which left
   * the admin-stop event relying entirely on its 410-on-ping fallback. */
  eventsToken?: () => string | undefined;
  /** Session-id platform prefix, e.g. `'web'` | `'tv'`. */
  idPrefix: string;
  /** Fired the first time the session is terminated (admin stop, or a 410). */
  onTerminated: (message: string) => void;
  /** Element whose play/pause events trigger a prompt heartbeat (TV). */
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** A value that, when it changes, triggers a prompt heartbeat (web passes its
   * React `playing` state). Omit to rely solely on `videoRef`. */
  pingSignal?: unknown;
}

// Mirrors SESSION_TTL in the server's playback registry. A beat that lands later
// than this has already been reaped, so pinging again opens a SECOND session
// rather than refreshing the first.
const SERVER_TTL_MS = 30_000;

let sessionSeq = 0;

function newSessionId(prefix: string): PlaybackSessionId {
  sessionSeq += 1;
  return PlaybackSessionId.parse(
    `${prefix}-${Date.now().toString(36)}-${(sessionSeq - 1).toString(36)}`,
  );
}

/**
 * A session id keys ONE row in the server's live "now playing" registry. It is
 * never an auth token: `/playback/stop` only ends a session the requesting
 * account owns, so the id needs uniqueness, not unpredictability. Clock plus a
 * per-process counter gives that on every target, the same shape as the phone
 * client's `newSessionId`.
 */
export function usePlaybackHeartbeat(params: PlaybackHeartbeatParams): void {
  const [sessionId] = useState(() => newSessionId(params.idPrefix));
  // Once terminated we stop pinging and don't send a redundant stop on unmount.
  const terminated = useRef(false);
  // A session exists on the server only once a beat has landed, so a surface
  // that never plays neither opens one nor closes one.
  const opened = useRef(false);
  // When the last beat left, and where the playhead was, which is what tells a
  // resumed viewing from a tab the browser has only been throttling.
  const beat = useRef<{ at: number; positionMs: number } | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const clientRef = useRef(params.client);
  clientRef.current = params.client;

  const fireTerminated = useEffectEvent((message: string) => {
    if (terminated.current) return;
    terminated.current = true;
    params.onTerminated(message);
  });

  const send = useEffectEvent(() => {
    if (!params.enabled || terminated.current) return;
    const state = params.getState();
    const positionMs = Math.round(params.getPosition() * 1000);
    const now = Date.now();
    const last = beat.current;
    // Nothing has played, so there is no session to open. A surface that only
    // ever buffers or sits paused is not a viewing.
    if (!opened.current && state !== 'playing') return;
    // A background tab's timer is clamped to about one wake-up a minute, so the
    // beat arrives after the server has reaped and logged the session. Opening
    // another one on an unmoved playhead writes a row a minute, forever.
    if (last && now - last.at >= SERVER_TTL_MS && positionMs === last.positionMs) return;
    beat.current = { at: now, positionMs };
    opened.current = true;
    const buffered = params.getBuffered?.();
    inFlight.current = params.client.playback
      .ping({
        sessionId,
        itemId: params.itemId,
        positionMs,
        durationMs: params.durationMs,
        state,
        mode: params.mode,
        player: params.player,
        device: params.device,
        audio: params.getAudio?.(),
        subtitle: params.getSubtitle?.(),
        ...(buffered === undefined ? {} : { bufferedMs: Math.round(buffered * 1000) }),
      })
      .catch((e: unknown) => {
        // 410 Gone → an admin terminated this session (WS fallback).
        if (e instanceof KromaApiError && e.status === 410) fireTerminated('');
      });
  });

  // Heartbeat loop + prompt ping on the element's play/pause + stop on unmount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: send reads through the effect event; re-run only on client/enabled.
  useEffect(() => {
    if (!params.enabled) return;
    const ping = () => send();
    ping();
    const iv = setInterval(ping, 10000);
    const { videoRef } = params;
    const v = videoRef?.current;
    v?.addEventListener('play', ping);
    v?.addEventListener('pause', ping);
    return () => {
      clearInterval(iv);
      v?.removeEventListener('play', ping);
      v?.removeEventListener('pause', ping);
    };
  }, [params.client, params.enabled]);

  // The stop belongs to the component's life, not to the effect above: that one
  // re-runs when the client is swapped underneath a playing surface, and ending
  // the session there would close a viewing nobody left. Held behind the last
  // ping, because a stop that overtakes it ends nothing and leaves the ping
  // behind it registering a session no one will ever close.
  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount only; the client is read through a ref.
  useEffect(
    () => () => {
      if (terminated.current || !opened.current) return;
      const stop = () => {
        clientRef.current.playback.stop(sessionId).catch(() => undefined);
      };
      const pending = inFlight.current;
      if (pending) void pending.then(stop, stop);
      else stop();
    },
    [],
  );

  // Prompt ping when the caller's play state changes (web passes React `playing`).
  useEffect(() => {
    if (params.pingSignal === undefined) return;
    send();
  }, [params.pingSignal]);

  // Listen for an admin terminating this session (matched by session id).
  // biome-ignore lint/correctness/useExhaustiveDependencies: the socket lives per enabled/baseUrl; the token closure reads its live value at handshake time.
  useEffect(() => {
    if (!params.enabled) return;
    const ev = new KromaEvents(params.eventsBaseUrl, {
      token: params.eventsToken,
      onEvent: (e) => {
        if (e.type === 'playback.terminate' && e.sessionId === sessionId) {
          fireTerminated(e.message);
        }
      },
    });
    ev.connect();
    return () => ev.close();
  }, [params.enabled, params.eventsBaseUrl]);
}
