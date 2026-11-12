import { constants, type KeyObject, publicDecrypt, randomBytes } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import {
  A_AUTH,
  A_CLSE,
  A_CNXN,
  A_OKAY,
  A_OPEN,
  A_STLS,
  A_WRTE,
  AUTH_RSAPUBLICKEY,
  AUTH_SIGNATURE,
  AUTH_TOKEN,
  encodePacket,
  type Packet,
  PacketReader,
} from './packet';

export interface ServiceSide {
  write(data: Buffer | string): void;
  close(): void;
  received: Buffer[];
  onData?: (data: Buffer) => void;
}

export type Service = (side: ServiceSide) => void;

export interface FakeAdbdOptions {
  trusted?: KeyObject[];
  acceptPrompt?: boolean;
  tls?: boolean;
  features?: string[];
  maxData?: number;
  services?: Record<string, Service>;
  silent?: boolean;
}

export interface FakeAdbd {
  port: number;
  prompts: string[];
  opened: string[];
  close(): Promise<void>;
}

const DIGEST_INFO = Buffer.from('3021300906052b0e03021a05000414', 'hex');

function signedBy(keys: KeyObject[], token: Buffer, signature: Buffer): boolean {
  return keys.some((key) => {
    try {
      const plain = publicDecrypt({ key, padding: constants.RSA_PKCS1_PADDING }, signature);
      return plain.equals(Buffer.concat([DIGEST_INFO, token]));
    } catch {
      return false;
    }
  });
}

type Side = ServiceSide & { remote: number };

class Session {
  private readonly sides = new Map<number, Side>();
  private token = randomBytes(20);
  private nextId = 100;

  constructor(
    private readonly socket: Socket,
    private readonly options: FakeAdbdOptions,
    private readonly fake: FakeAdbd,
  ) {}

  handle(packet: Packet): void {
    if (packet.command === A_CNXN) this.greet();
    else if (packet.command === A_AUTH) this.authenticate(packet);
    else if (packet.command === A_OPEN) this.open(packet);
    else if (packet.command === A_WRTE) this.take(packet);
  }

  private send(command: number, arg0: number, arg1: number, payload: Buffer = Buffer.alloc(0)) {
    this.socket.write(encodePacket({ command, arg0, arg1, payload }));
  }

  private connect(): void {
    const features = (this.options.features ?? ['cmd']).join(',');
    const banner = `device::ro.product.model=Fake TV;features=${features}\0`;
    this.send(A_CNXN, 0x01000001, this.options.maxData ?? 4096, Buffer.from(banner));
  }

  private greet(): void {
    if (this.options.tls) this.send(A_STLS, 1, 0);
    else if (this.options.trusted) this.send(A_AUTH, AUTH_TOKEN, 0, this.token);
    else this.connect();
  }

  private authenticate(packet: Packet): void {
    if (packet.arg0 === AUTH_SIGNATURE) {
      if (signedBy(this.options.trusted ?? [], this.token, packet.payload)) return this.connect();
      this.token = randomBytes(20);
      return this.send(A_AUTH, AUTH_TOKEN, 0, this.token);
    }
    if (packet.arg0 !== AUTH_RSAPUBLICKEY) return;
    this.fake.prompts.push(packet.payload.toString('utf8'));
    if (this.options.acceptPrompt) this.connect();
  }

  private open(packet: Packet): void {
    const name = packet.payload.toString('utf8').replaceAll('\0', '');
    this.fake.opened.push(name);
    const service = this.options.services?.[name];
    if (!service) return this.send(A_CLSE, 0, packet.arg0);

    const id = this.nextId++;
    const side: Side = {
      remote: packet.arg0,
      received: [],
      write: (data) => this.send(A_WRTE, id, packet.arg0, Buffer.from(data)),
      close: () => this.send(A_CLSE, id, packet.arg0),
    };
    this.sides.set(id, side);
    this.send(A_OKAY, id, packet.arg0);
    service(side);
  }

  private take(packet: Packet): void {
    const side = this.sides.get(packet.arg1);
    if (!side) return;
    this.send(A_OKAY, packet.arg1, packet.arg0);
    side.received.push(packet.payload);
    side.onData?.(packet.payload);
  }
}

function serve(socket: Socket, options: FakeAdbdOptions, fake: FakeAdbd): void {
  const reader = new PacketReader();
  const session = new Session(socket, options, fake);
  socket.on('data', (chunk: Buffer) => {
    if (options.silent) return;
    for (const packet of reader.push(chunk)) session.handle(packet);
  });
  socket.on('error', () => undefined);
}

/** An adb daemon in this process, just enough of one to test a client against. */
export async function fakeAdbd(options: FakeAdbdOptions = {}): Promise<FakeAdbd> {
  const sockets = new Set<Socket>();
  const fake: FakeAdbd = { port: 0, prompts: [], opened: [], close: async () => undefined };
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    serve(socket, options, fake);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  fake.port = typeof address === 'object' && address ? address.port : 0;
  fake.close = () =>
    new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    });
  return fake;
}

/** A service that answers one text and closes. */
export const answers =
  (text: string): Service =>
  (side) => {
    side.write(text);
    side.close();
  };

/** A service that takes `size` bytes, then answers and closes. */
export const takes =
  (size: number, answer: string): Service =>
  (side) => {
    let have = 0;
    side.onData = (data) => {
      have += data.length;
      if (have < size) return;
      side.write(answer);
      side.close();
    };
  };
