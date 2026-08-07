// Live server events over WebSocket (`/api/events`), with reconnect backoff.

import { sessionToken } from './session';
import type { CastClientMessage, CastCommand, CastReceiver, CastState, StageStat } from './types';

export type ServerEvent =
  | { type: 'hello'; version: string }
  | { type: 'scan.started' }
  | { type: 'scan.completed'; items: number; shows: number; libraries: number }
  | { type: 'library.updated' }
  | { type: 'item.updated'; id: string }
  | { type: 'show.updated'; id: string }
  | { type: 'enrich.progress'; done: number; total: number }
  | { type: 'enrich.completed'; resolved: number; total: number }
  | { type: 'probe.progress'; done: number; total: number }
  | { type: 'probe.completed'; total: number }
  | { type: 'playback.started'; count: number }
  | { type: 'playback.updated'; count: number }
  | { type: 'playback.stopped'; count: number }
  | { type: 'playback.terminate'; sessionId: string; message: string }
  | { type: 'cast.receiver'; receiver: CastReceiver }
  | { type: 'cast.receiver.gone'; receiverId: string }
  | { type: 'cast.kicked'; receiverId: string }
  | {
      type: 'cast.position';
      receiverId: string;
      positionMs: number;
      durationMs?: number;
      state: CastState;
    }
  | { type: 'cast.command'; receiverId: string; seq: number; command: CastCommand }
  | { type: 'settings.updated' }
  | { type: 'job.started'; key: string; runId: string }
  | { type: 'job.progress'; key: string; runId: string; done: number; total: number }
  | { type: 'job.log'; runId: string; level: string; message: string }
  | { type: 'job.finished'; key: string; runId: string; status: string }
  | { type: 'pipeline.stats'; stages: StageStat[] }
  | { type: 'request.updated'; id: string; status: string }
  | { type: 'report.updated'; id: string; status: string }
  // Addressed: the server sends these only to sockets signed in as the
  // recipient, so receiving one always means "this is yours".
  | { type: 'notification.created'; id: string; unread: number }
  | { type: 'notification.read'; unread: number };

// Module-emitted frames (`vpn.status`, `download.progress`, ...) ride the same
// socket but are NOT part of this union: core does not model module events.
// A module declares its own frame types in its package and a listener that
// wants them widens the socket: `new KromaEvents<ServerEvent | TheirEvent>()`.

export interface KromaEventsOptions<E extends { type: string } = ServerEvent> {
  token?: () => string | undefined;
  onEvent?: (event: E) => void;
  onOpen?: () => void;
  onClose?: () => void;
  WebSocketImpl?: typeof WebSocket;
  maxBackoffMs?: number;
}

export class KromaEvents<E extends { type: string } = ServerEvent> {
  private readonly url: string;
  private readonly opts: KromaEventsOptions<E>;
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(baseUrl: string, opts: KromaEventsOptions<E> = {}) {
    this.url = `${baseUrl.replace(/^http/i, 'ws').replace(/(^|[^/])\/+$/, '$1')}/api/events`;
    this.opts = opts;
  }

  /** Returns false when the socket isn't open, so the caller can fall back to
   * the HTTP path rather than silently dropping the message. */
  send(message: CastClientMessage): boolean {
    const ws = this.ws;
    if (ws?.readyState !== 1 /* OPEN */) return false;
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  get open(): boolean {
    return this.ws?.readyState === 1;
  }

  connect(): void {
    if (this.closed) return;
    const WS = this.opts.WebSocketImpl ?? globalThis.WebSocket;
    if (!WS) return;

    let ws: WebSocket;
    // A browser can't set headers on a WS handshake, so the bearer rides as a
    // subprotocol the server validates and echoes back (see server ws.rs). Read
    // fresh on each (re)connect so a refreshed token is picked up. A
    // multi-server client (the TV) must supply `token`: the fallback reads the
    // default store, which would authenticate it against the wrong server.
    const token = this.opts.token?.() ?? sessionToken();
    try {
      ws = token ? new WS(this.url, `kroma.session.${token}`) : new WS(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.opts.onOpen?.();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      try {
        this.opts.onEvent?.(JSON.parse(ev.data) as E);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      this.opts.onClose?.();
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const max = this.opts.maxBackoffMs ?? 15000;
    const delay = Math.min(1000 * 2 ** this.retry, max);
    this.retry += 1;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}
