import { z } from 'zod';
import { sessionRefresh, sessionToken } from '../../core/session';
import type { CastClientMessage } from '../cast';
import type { ServerEvent } from './schemas';

const OPEN = 1;

const Frame = z.object({ type: z.string().min(1) });

function decodeFrame<E extends { type: string }>(data: string): E | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  return z.validate(Frame, parsed) ? (parsed as E) : null;
}

export interface KromaEventsOptions<E extends { type: string } = ServerEvent> {
  token?: () => string | undefined;
  refresh?: () => Promise<string | undefined>;
  onEvent?: (event: E) => void;
  onOpen?: () => void;
  onClose?: () => void;
  WebSocketImpl?: typeof WebSocket;
  maxBackoffMs?: number;
  /** How long to wait before re-checking for the session bearer, which a reload
   *  does not have until the stored access token has been exchanged. Defaults
   *  to 150ms. */
  tokenWaitMs?: number;
}

export class KromaEvents<E extends { type: string } = ServerEvent> {
  private readonly url: string;
  private readonly opts: KromaEventsOptions<E>;
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private tokenWaits = 0;
  private refreshSpent = false;
  private refreshedToken: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(baseUrl: string, opts: KromaEventsOptions<E> = {}) {
    this.url = `${baseUrl.replace(/^http/i, 'ws').replace(/(^|[^/])\/+$/, '$1')}/api/events`;
    this.opts = opts;
  }

  /** Returns false when the socket isn't open, so the caller can fall back to
   * the HTTP path rather than silently dropping the message. */
  send(message: CastClientMessage): boolean {
    const ws = this.ws;
    if (ws?.readyState !== OPEN) return false;
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  get open(): boolean {
    return this.ws?.readyState === OPEN;
  }

  connect(): void {
    if (this.closed) return;
    const WS = this.opts.WebSocketImpl ?? globalThis.WebSocket;
    if (!WS) return;

    let ws: WebSocket;
    // A browser can't set headers on a WS handshake, so the bearer rides as a
    // subprotocol the server validates and echoes back (see server ws.rs), read
    // fresh on each (re)connect. A multi-server client (the TV) must supply
    // `token`: the fallback reads the default store, which would authenticate it
    // against the wrong server.
    const token = this.refreshedToken ?? this.opts.token?.() ?? sessionToken();
    if (!token) {
      this.waitForToken();
      return;
    }
    this.tokenWaits = 0;
    try {
      ws = new WS(this.url, `kroma.session.${token}`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.refreshedToken = undefined;
    this.ws = ws;

    let opened = false;
    ws.onopen = () => {
      opened = true;
      this.retry = 0;
      this.refreshSpent = false;
      this.opts.onOpen?.();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      const frame = decodeFrame<E>(ev.data);
      if (frame) this.opts.onEvent?.(frame);
    };
    ws.onclose = () => {
      this.opts.onClose?.();
      // The server answers an expired bearer with a 401 on the upgrade (ws.rs),
      // which a WebSocket surfaces as a plain close carrying no readable status:
      // closing without ever opening is the only sign the bearer may be at fault.
      const refresh = this.opts.refresh ?? sessionRefresh();
      if (this.closed || opened || this.refreshSpent || !refresh) {
        this.scheduleReconnect();
        return;
      }
      void this.refreshBearer(refresh);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  }

  private async refreshBearer(refresh: () => Promise<string | undefined>): Promise<void> {
    this.refreshSpent = true;
    let token: string | undefined;
    try {
      token = await refresh();
    } catch {
      token = undefined;
    }
    if (this.closed) return;
    if (!token) {
      this.scheduleReconnect();
      return;
    }
    this.refreshedToken = token;
    this.connect();
  }

  private waitForToken(): void {
    const base = this.opts.tokenWaitMs ?? 150;
    this.timer = this.after(Math.min(base * 2 ** this.tokenWaits, this.maxBackoff));
    this.tokenWaits += 1;
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.timer = this.after(Math.min(1000 * 2 ** this.retry, this.maxBackoff));
    this.retry += 1;
  }

  private get maxBackoff(): number {
    return this.opts.maxBackoffMs ?? 15000;
  }

  private after(delay: number): ReturnType<typeof setTimeout> {
    clearTimeout(this.timer);
    return setTimeout(() => this.connect(), delay);
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    try {
      this.ws?.close();
    } catch {}
  }
}
