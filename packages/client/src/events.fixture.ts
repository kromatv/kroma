/** A controllable WebSocket stand-in. Each construction is recorded in
 *  {@link FakeWS.instances} so a test can drive its lifecycle callbacks by hand. */
export class FakeWS {
  static readonly instances: FakeWS[] = [];
  url: string;
  protocol: string | undefined;
  readyState = 0;
  sent: string[] = [];
  sendThrows = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string, protocol?: string) {
    this.url = url;
    this.protocol = protocol;
    FakeWS.instances.push(this);
  }
  send(data: string): void {
    if (this.sendThrows) throw new Error('socket buffer full');
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  static reset(): void {
    FakeWS.instances.length = 0;
  }
}

/** {@link FakeWS} under the DOM type, ready to pass as `WebSocketImpl`. */
export const WSImpl = FakeWS as unknown as typeof WebSocket;
