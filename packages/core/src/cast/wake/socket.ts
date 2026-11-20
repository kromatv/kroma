import type { LanSocket } from './reach';

const OPEN_WITHIN_MS = 4000;

interface Waiter {
  resolve: (text: string) => void;
  reject: (reason: Error) => void;
}

/** Frames and whoever waits for them. A frame that arrives before anybody
 * asked waits in `frames`; whoever asks before one arrives waits in
 * `waiters`. Only one of the two holds anything at a time. */
class Inbox {
  private readonly frames: string[] = [];
  private readonly waiters: Waiter[] = [];
  private closed = false;

  deliver(text: string): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(text);
    } else {
      this.frames.push(text);
    }
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(new Error('closed'));
    }
  }

  next(withinMs: number): Promise<string> {
    const ready = this.frames.shift();
    if (ready !== undefined) {
      return Promise.resolve(ready);
    }
    if (this.closed) {
      return Promise.reject(new Error('closed'));
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject };
      this.waiters.push(waiter);
      setTimeout(() => {
        this.giveUp(waiter);
      }, withinMs);
    });
  }

  private giveUp(waiter: Waiter): void {
    const at = this.waiters.indexOf(waiter);
    if (at >= 0) {
      this.waiters.splice(at, 1);
      waiter.reject(new Error('no answer'));
    }
  }
}

function conversation(socket: WebSocket, inbox: Inbox): LanSocket {
  return {
    send: (text) => {
      socket.send(text);
      return Promise.resolve();
    },
    next: (withinMs) => inbox.next(withinMs),
    close: () => {
      socket.close();
    },
  };
}

/** The platform's own WebSocket as a `LanSocket`. It accepts only a
 * certificate the platform trusts. */
export function webSocket(url: string): Promise<LanSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const inbox = new Inbox();
    const late = setTimeout(() => {
      socket.close();
      reject(new Error('no answer'));
    }, OPEN_WITHIN_MS);
    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        inbox.deliver(event.data);
      }
    });
    socket.addEventListener('close', () => {
      inbox.close();
    });
    socket.addEventListener('error', () => {
      clearTimeout(late);
      reject(new Error('no answer'));
    });
    socket.addEventListener('open', () => {
      clearTimeout(late);
      resolve(conversation(socket, inbox));
    });
  });
}
