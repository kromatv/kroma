import { connect, type Socket } from 'node:net';
import { type AdbKey, signToken } from './key';
import {
  A_AUTH,
  A_CLSE,
  A_CNXN,
  A_OKAY,
  A_OPEN,
  A_STLS,
  A_WRTE,
  ADB_VERSION,
  AUTH_RSAPUBLICKEY,
  AUTH_SIGNATURE,
  AUTH_TOKEN,
  encodePacket,
  HOST_MAX_PAYLOAD,
  type Packet,
  PacketReader,
} from './packet';
import { AdbStream } from './stream';

const CONNECT_TIMEOUT_MS = 10_000;
const PROMPT_TIMEOUT_MS = 120_000;

export interface Banner {
  props: Record<string, string>;
  features: string[];
}

export interface HandshakeOptions {
  keys: readonly AdbKey[];
  onPrompt?: () => void;
  timeoutMs?: number;
  promptTimeoutMs?: number;
}

/** The TV did not let this computer in: no key it trusts, and no one accepted the prompt. */
export class AdbUnauthorized extends Error {}

/** What a TV says about itself when it lets a computer in. */
export function parseBanner(payload: Buffer): Banner {
  const text = payload.toString('utf8').replaceAll('\0', '');
  const fields = text.split(':').slice(2).join(':').split(';');
  const props: Record<string, string> = {};
  for (const field of fields) {
    const at = field.indexOf('=');
    if (at > 0) props[field.slice(0, at)] = field.slice(at + 1);
  }
  return { props, features: (props.features ?? '').split(',').filter(Boolean) };
}

function dial(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`${host}:${port} did not answer adb`));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * A connection to the adb daemon of a TV, spoken directly over TCP, so no
 * adb binary has to be on the computer.
 */
export class AdbConnection {
  banner: Banner = { props: {}, features: [] };
  maxPayload = 4096;
  private readonly streams = new Map<number, AdbStream>();
  private readonly inbox: Packet[] = [];
  private waiting: ((packet: Packet | Error) => void) | null = null;
  private failure: Error | null = null;
  private connected = false;
  private nextLocal = 1;

  private constructor(private readonly socket: Socket) {
    const reader = new PacketReader();
    socket.on('data', (chunk: Buffer) => {
      try {
        for (const packet of reader.push(chunk)) this.receive(packet);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
        socket.destroy();
      }
    });
    socket.on('error', (error) => this.fail(error));
    socket.on('close', () => this.fail(new Error('the TV closed the adb connection')));
  }

  /** Connects and lets the TV check this computer's keys, asking it to trust one when allowed. */
  static async open(host: string, port: number, options: HandshakeOptions): Promise<AdbConnection> {
    const socket = await dial(host, port, options.timeoutMs ?? CONNECT_TIMEOUT_MS);
    const connection = new AdbConnection(socket);
    try {
      await connection.handshake(options);
      return connection;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  async open(service: string): Promise<AdbStream> {
    const stream = new AdbStream(
      {
        maxPayload: this.maxPayload,
        write: (local, remote, data) => this.send(A_WRTE, local, remote, data),
        close: (local, remote) => this.send(A_CLSE, local, remote),
      },
      this.nextLocal,
    );
    this.nextLocal += 1;
    this.streams.set(stream.localId, stream);
    const opened = stream.waitOpened(service);
    this.send(A_OPEN, stream.localId, 0, Buffer.from(`${service}\0`));
    await opened;
    return stream;
  }

  close(): void {
    this.socket.destroy();
  }

  private async handshake(options: HandshakeOptions): Promise<void> {
    const { keys, onPrompt } = options;
    const timeoutMs = options.timeoutMs ?? CONNECT_TIMEOUT_MS;
    this.send(A_CNXN, ADB_VERSION, HOST_MAX_PAYLOAD, Buffer.from('host::\0'));
    let tried = 0;
    let prompted = false;
    for (;;) {
      const packet = await this.next(
        prompted ? (options.promptTimeoutMs ?? PROMPT_TIMEOUT_MS) : timeoutMs,
        prompted,
      );
      if (packet.command === A_CNXN) {
        this.banner = parseBanner(packet.payload);
        this.maxPayload = Math.min(packet.arg1, HOST_MAX_PAYLOAD);
        this.connected = true;
        return;
      }
      if (packet.command === A_STLS) {
        throw new Error(
          'the TV asks for Wireless debugging with a pairing code, which this tool does not speak',
        );
      }
      if (packet.command !== A_AUTH || packet.arg0 !== AUTH_TOKEN) continue;

      const key = keys[tried];
      tried += 1;
      if (key) {
        this.send(A_AUTH, AUTH_SIGNATURE, 0, signToken(key.privateKey, packet.payload));
        continue;
      }
      const offered = keys.at(-1);
      if (!onPrompt || prompted || !offered) {
        throw new AdbUnauthorized('the TV does not trust this computer yet');
      }
      this.send(A_AUTH, AUTH_RSAPUBLICKEY, 0, Buffer.from(`${offered.publicKey}\0`));
      prompted = true;
      onPrompt();
    }
  }

  private next(timeoutMs: number, prompted: boolean): Promise<Packet> {
    const queued = this.inbox.shift();
    if (queued) return Promise.resolve(queued);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(
          prompted
            ? new AdbUnauthorized('nobody allowed this computer on the TV within two minutes')
            : new Error('the TV stopped answering adb'),
        );
      }, timeoutMs);
      this.waiting = (packet) => {
        clearTimeout(timer);
        this.waiting = null;
        if (packet instanceof Error) reject(packet);
        else resolve(packet);
      };
    });
  }

  private receive(packet: Packet): void {
    if (!this.connected) {
      if (this.waiting) this.waiting(packet);
      else this.inbox.push(packet);
      return;
    }
    const stream = this.streams.get(packet.arg1);
    if (!stream) return;
    if (packet.command === A_OKAY) stream.ready(packet.arg0);
    else if (packet.command === A_WRTE) {
      this.send(A_OKAY, stream.localId, packet.arg0);
      stream.deliver(packet.payload);
    } else if (packet.command === A_CLSE) {
      this.streams.delete(stream.localId);
      stream.end();
    }
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    this.waiting?.(error);
    for (const stream of this.streams.values()) stream.fail(error);
    this.streams.clear();
  }

  private send(
    command: number,
    arg0: number,
    arg1: number,
    payload: Buffer = Buffer.alloc(0),
  ): void {
    if (!this.socket.destroyed) this.socket.write(encodePacket({ command, arg0, arg1, payload }));
  }
}
