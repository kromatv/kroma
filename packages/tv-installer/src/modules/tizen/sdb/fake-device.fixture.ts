import { randomBytes, randomInt } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import {
  encodePacket,
  HEADER_BYTES,
  HOST_MAX_DATA,
  PacketReader,
  PROTOCOL_VERSION,
  SDB_COMMAND,
  type SdbPacket,
} from './packet';

const EMPTY = Buffer.alloc(0);
const SPLIT_DELAY_MS = 5;
const NAMES = ['Salon', 'Chambre', 'Cuisine', 'Bureau', 'Atelier'];
const DIRECTORIES = ['sdk_tools', 'sideload', 'staging', 'widgets'];
const TOOLS = ['pkgcmd', 'app_launcher', 'profile_command', 'wrt-launcher'];

const pick = <T>(values: readonly T[]): T => values[randomInt(values.length)] as T;
const bytesOf = (payload: Buffer | string): Buffer =>
  typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;

export const deviceName = (): string => `${pick(NAMES)} ${randomInt(1, 99)}`;
export const toolPath = (): string => `/home/owner/share/tmp/${pick(DIRECTORIES)}${randomInt(99)}`;
export const shellCommand = (): string => `/usr/bin/${pick(TOOLS)} -${randomInt(99)}`;
export const streamId = (): number => randomInt(1, 4096);
export const applicationId = (): string => `KromaTV${randomInt(100, 999)}.KROMA`;

export function capabilityPayload(entries: Record<string, string>): Buffer {
  const lines = Object.entries(entries).map(([key, value]) => `${key}:${value}\n`);
  const body = Buffer.from(lines.join(''), 'utf8');
  const prefix = Buffer.alloc(2);
  prefix.writeUInt16LE(body.length, 0);
  return Buffer.concat([prefix, body]);
}

export interface ServiceSession {
  readonly service: string;
  read(): Promise<Buffer>;
  write(payload: Buffer | string): void;
  end(payload: Buffer | string): void;
  close(): void;
}

export type ServiceHandler = (session: ServiceSession) => void;

export interface FakeDeviceOptions {
  banner?: string;
  maxData?: number;
  handshake?: 'banner' | 'split' | 'auth' | 'silence';
}

export interface FakeDevice {
  readonly host: string;
  readonly port: number;
  readonly banner: string;
  readonly received: SdbPacket[];
  readonly opened: string[];
  serve(service: string, handler: ServiceHandler): void;
  raw(bytes: Buffer): void;
  reset(): void;
  /** Resolves when the client hangs up on the connection this device accepted. */
  hungUpOn(): Promise<void>;
  close(): Promise<void>;
}

class DeviceSession implements ServiceSession {
  private readonly waiting: ((payload: Buffer) => void)[] = [];

  constructor(
    readonly service: string,
    private readonly deviceId: number,
    private readonly hostId: number,
    private readonly socket: Socket,
  ) {}

  accept(payload: Buffer): void {
    this.socket.write(this.frame(SDB_COMMAND.OKAY, EMPTY));
    const waiter = this.waiting.shift();
    if (!waiter) throw new Error(`the fake device was not reading ${this.service}`);
    waiter(payload);
  }

  read(): Promise<Buffer> {
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  write(payload: Buffer | string): void {
    this.socket.write(this.frame(SDB_COMMAND.WRTE, bytesOf(payload)));
  }

  end(payload: Buffer | string): void {
    const said = this.frame(SDB_COMMAND.WRTE, bytesOf(payload));
    this.socket.write(Buffer.concat([said, this.frame(SDB_COMMAND.CLSE, EMPTY)]));
  }

  close(): void {
    this.socket.write(this.frame(SDB_COMMAND.CLSE, EMPTY));
  }

  private frame(command: number, data: Buffer): Buffer {
    return encodePacket({ command, arg0: this.deviceId, arg1: this.hostId, data });
  }
}

export async function fakeDevice({
  banner = `device::${randomBytes(4).toString('hex')}`,
  maxData = HOST_MAX_DATA,
  handshake = 'banner',
}: FakeDeviceOptions = {}): Promise<FakeDevice> {
  const services = new Map<string, ServiceHandler>();
  const sessions = new Map<number, DeviceSession>();
  const received: SdbPacket[] = [];
  const opened: string[] = [];
  const sockets: Socket[] = [];
  let nextId = 101;

  const answerHandshake = (socket: Socket): void => {
    if (handshake === 'silence') return;
    if (handshake === 'auth') {
      const challenge = { command: SDB_COMMAND.AUTH, arg0: 1, arg1: 0, data: randomBytes(20) };
      socket.write(encodePacket(challenge));
      return;
    }
    const hello = encodePacket({
      command: SDB_COMMAND.CNXN,
      arg0: PROTOCOL_VERSION,
      arg1: maxData,
      data: Buffer.from(`${banner}\0`, 'utf8'),
    });
    if (handshake === 'banner') {
      socket.write(hello);
      return;
    }
    socket.write(hello.subarray(0, HEADER_BYTES + 2));
    setTimeout(() => socket.write(hello.subarray(HEADER_BYTES + 2)), SPLIT_DELAY_MS);
  };

  const openService = (socket: Socket, packet: SdbPacket): void => {
    const service = trimNul(packet.data.toString('utf8'));
    opened.push(service);
    const handler =
      services.get(service) ?? [...services].find(([prefix]) => service.startsWith(prefix))?.[1];
    if (!handler) {
      const refusal = { command: SDB_COMMAND.CLSE, arg0: 0, arg1: packet.arg0, data: EMPTY };
      socket.write(encodePacket(refusal));
      return;
    }
    const deviceId = nextId++;
    const session = new DeviceSession(service, deviceId, packet.arg0, socket);
    sessions.set(deviceId, session);
    const accepted = { command: SDB_COMMAND.OKAY, arg0: deviceId, arg1: packet.arg0, data: EMPTY };
    socket.write(encodePacket(accepted));
    handler(session);
  };

  const handle = (socket: Socket, packet: SdbPacket): void => {
    received.push(packet);
    if (packet.command === SDB_COMMAND.CNXN) answerHandshake(socket);
    if (packet.command === SDB_COMMAND.OPEN) openService(socket, packet);
    if (packet.command === SDB_COMMAND.CLSE) sessions.delete(packet.arg1);
    if (packet.command === SDB_COMMAND.WRTE) sessions.get(packet.arg1)?.accept(packet.data);
  };

  const server = createServer((socket) => {
    sockets.push(socket);
    socket.setNoDelay(true);
    socket.on('error', () => undefined);
    const reader = new PacketReader(HOST_MAX_DATA);
    socket.on('data', (chunk) => {
      for (const packet of reader.push(chunk)) handle(socket, packet);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port was assigned');

  return {
    host: '127.0.0.1',
    port: address.port,
    banner,
    received,
    opened,
    serve: (service, handler) => {
      services.set(service, handler);
    },
    raw: (bytes) => {
      sockets.at(-1)?.write(bytes);
    },
    hungUpOn: () =>
      new Promise<void>((resolve) => {
        const socket = sockets.at(-1);
        if (!socket || socket.destroyed) return resolve();
        socket.once('close', () => resolve());
      }),
    reset: () => sockets.at(-1)?.resetAndDestroy(),
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets.splice(0)) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

function trimNul(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === '\0') end -= 1;
  return text.slice(0, end);
}
