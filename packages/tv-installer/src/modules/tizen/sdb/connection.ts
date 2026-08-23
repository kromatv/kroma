import { createConnection, type Socket } from 'node:net';
import {
  commandName,
  encodePacket,
  HOST_BANNER,
  HOST_MAX_DATA,
  PacketReader,
  PROTOCOL_VERSION,
  SDB_COMMAND,
  type SdbPacket,
} from './packet';
import { SdbStream, type StreamTransport } from './stream';

export const SDB_PORT = 26101;

const HANDSHAKE_TIMEOUT_MS = 15_000;

export interface ConnectionOptions {
  timeoutMs?: number;
}

/**
 * A live sdb transport to one device. Every service runs on its own multiplexed
 * stream, so several may be open at once on the single socket.
 */
export class SdbConnection implements StreamTransport {
  maxData = HOST_MAX_DATA;
  banner = '';

  private readonly reader = new PacketReader(HOST_MAX_DATA);
  private readonly streams = new Map<number, SdbStream>();
  private nextId = 1;
  private failure: Error | null = null;
  private onConnected: ((banner: string) => void) | null = null;
  private onRejected: ((error: Error) => void) | null = null;

  private constructor(private readonly socket: Socket) {
    socket.on('data', (chunk) => this.receive(chunk));
    socket.on('error', (error) => this.fail(error));
    socket.on('close', () => this.fail(new Error('sdb: the device closed the connection')));
  }

  static async open(
    host: string,
    port = SDB_PORT,
    { timeoutMs = HANDSHAKE_TIMEOUT_MS }: ConnectionOptions = {},
  ): Promise<SdbConnection> {
    const socket = await dial(host, port, timeoutMs);
    const connection = new SdbConnection(socket);
    try {
      await connection.handshake(timeoutMs);
    } catch (error) {
      // A host that accepts 26101 without being a television leaves the socket
      // open otherwise, and a sweep meets a few of those on every network.
      connection.close();
      throw error;
    }
    return connection;
  }

  async openStream(service: string, timeoutMs = HANDSHAKE_TIMEOUT_MS): Promise<SdbStream> {
    if (this.failure) throw this.failure;
    const localId = this.nextId++;
    const stream = new SdbStream(service, localId, this);
    this.streams.set(localId, stream);
    const ready = stream.ready(timeoutMs);
    this.send(SDB_COMMAND.OPEN, localId, 0, Buffer.from(`${service}\0`, 'utf8'));
    await ready;
    return stream;
  }

  send(command: number, arg0: number, arg1: number, data: Buffer): void {
    if (this.socket.destroyed) return;
    this.socket.write(encodePacket({ command, arg0, arg1, data }));
  }

  release(localId: number): void {
    this.streams.delete(localId);
  }

  close(): void {
    this.socket.destroy();
  }

  private handshake(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('sdb: no banner, the set may not be in developer mode')),
        timeoutMs,
      );
      const settle = (error?: Error) => {
        clearTimeout(timer);
        this.onConnected = null;
        this.onRejected = null;
        if (error) reject(error);
        else resolve();
      };
      this.onConnected = (banner) => {
        this.banner = banner;
        settle();
      };
      this.onRejected = settle;
      this.send(
        SDB_COMMAND.CNXN,
        PROTOCOL_VERSION,
        HOST_MAX_DATA,
        Buffer.from(HOST_BANNER, 'utf8'),
      );
    });
  }

  private receive(chunk: Buffer): void {
    let packets: SdbPacket[];
    try {
      packets = this.reader.push(chunk);
    } catch (error) {
      this.fail(error as Error);
      return;
    }
    for (const packet of packets) this.dispatch(packet);
  }

  private dispatch(packet: SdbPacket): void {
    if (packet.command === SDB_COMMAND.CNXN) {
      this.maxData = Math.min(HOST_MAX_DATA, packet.arg1 || HOST_MAX_DATA);
      this.onConnected?.(bannerFrom(packet.data));
      return;
    }
    if (packet.command === SDB_COMMAND.AUTH) {
      this.onRejected?.(
        new Error('sdb: the device demands RSA authentication, which Tizen does not'),
      );
      return;
    }
    const stream = this.streams.get(packet.arg1);
    if (!stream) return;
    if (packet.command === SDB_COMMAND.OKAY) stream.onOkay(packet.arg0);
    else if (packet.command === SDB_COMMAND.WRTE) stream.onData(packet.data);
    else if (packet.command === SDB_COMMAND.CLSE) stream.onClose();
    else this.fail(new Error(`sdb: unexpected ${commandName(packet.command)}`));
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    this.onRejected?.(error);
    for (const stream of this.streams.values()) stream.onFail(error);
    this.streams.clear();
    this.socket.destroy();
  }
}

function bannerFrom(data: Buffer): string {
  let end = data.length;
  while (end > 0 && data[end - 1] === 0) end -= 1;
  return data.subarray(0, end).toString('utf8');
}

function dial(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.setNoDelay(true);
    socket.setTimeout(timeoutMs);
    const fail = (message: string) => () => {
      socket.destroy();
      reject(new Error(`sdb: ${message} ${host}:${port}`));
    };
    socket.once('connect', () => {
      socket.setTimeout(0);
      socket.removeAllListeners('timeout');
      socket.removeAllListeners('error');
      resolve(socket);
    });
    socket.once('timeout', fail('timed out connecting to'));
    socket.once('error', fail('could not reach'));
  });
}
