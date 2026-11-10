import { generateKeyPairSync, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type AuthContext,
  type Connection,
  type ServerChannel,
  type Session,
  Server as SshServer,
  utils,
} from 'ssh2';
import { serveSftp } from './fake-sftp.fixture';

export const PASSPHRASE = 'A1B2C3';

export type Reply = Readonly<Record<string, unknown>>;

export interface FakeTvOptions {
  keyServer?: 'on' | 'off' | 'refusing' | 'garbage';
  sftp?: boolean;
  acceptKey?: boolean;
  installReplies?: readonly Reply[];
  installExits?: boolean;
  sessionReply?: Reply;
  launchReply?: Reply;
  mkdirCode?: number;
}

export interface FakeTv {
  readonly host: string;
  readonly sshPort: number;
  readonly keyServerPort: number;
  readonly files: Map<string, Buffer>;
  readonly received: Map<string, Buffer>;
  readonly commands: string[];
  readonly users: string[];
  close(): Promise<void>;
}

interface DevModeKeys {
  encrypted: string;
  publicSsh: Buffer;
  verify(blob: Buffer, signature: Buffer, hashAlgo?: string): boolean;
}

let keys: DevModeKeys | null = null;

/** The set's key pair, encrypted with `PASSPHRASE` the way its key server hands it out. */
export function devModeKeys(): DevModeKeys {
  if (keys) return keys;
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: {
      type: 'pkcs1',
      format: 'pem',
      cipher: 'aes-128-cbc',
      passphrase: PASSPHRASE,
    },
  });
  const parsed = utils.parseKey(privateKey, PASSPHRASE);
  if (parsed instanceof Error) throw parsed;
  keys = {
    encrypted: privateKey,
    publicSsh: parsed.getPublicSSH(),
    verify: (blob, signature, hashAlgo) => parsed.verify(blob, signature, hashAlgo) === true,
  };
  return keys;
}

const HOST_KEY = utils.generateKeyPairSync('ed25519').private;

const DEFAULT_INSTALL: readonly Reply[] = [
  { returnValue: true, subscribed: true },
  { details: { state: 'installing' } },
  { details: { state: 'installed' } },
];

/** A webOS set in Dev Mode on localhost, answering what the ares sources show it answers. */
export async function startFakeTv(options: FakeTvOptions = {}): Promise<FakeTv> {
  const device: Device = {
    options,
    files: new Map(),
    received: new Map(),
    commands: [],
    users: [],
  };
  const ssh = new SshServer({ hostKeys: [HOST_KEY] }, (client) => serveClient(client, device));
  const sshPort = await listen(ssh);
  const http = keyServer(options.keyServer ?? 'on');
  const keyServerPort = await listen(http);
  if (options.keyServer === 'off') await shut(http);

  return {
    host: '127.0.0.1',
    sshPort,
    keyServerPort,
    files: device.files,
    received: device.received,
    commands: device.commands,
    users: device.users,
    close: async () => {
      await Promise.all([shut(ssh), options.keyServer === 'off' ? undefined : shut(http)]);
    },
  };
}

function serveClient(client: Connection, device: Device): void {
  client.on('error', () => undefined);
  client.on('authentication', (context) => authenticate(context, device));
  client.on('ready', () => client.on('session', (accept) => serveSession(accept(), device)));
}

function serveSession(session: Session, device: Device): void {
  const store = (path: string, data: Buffer) => {
    device.files.set(path, data);
    device.received.set(path, data);
  };
  session.on('exec', (accept, _reject, info) => {
    device.commands.push(info.command);
    answer(info.command, accept(), device);
  });
  session.on('sftp', (accept, reject) => {
    if (device.options.sftp === false) return reject();
    serveSftp(accept(), store);
  });
}

function authenticate(context: AuthContext, device: Device): void {
  device.users.push(context.username);
  if (context.method !== 'publickey' || device.options.acceptKey === false) {
    return context.reject();
  }
  const known = devModeKeys();
  const offered = context.key.data;
  const same =
    offered.length === known.publicSsh.length && timingSafeEqual(offered, known.publicSsh);
  if (!same) return context.reject();
  const { signature, blob } = context;
  if (signature && !(blob && known.verify(blob, signature, context.hashAlgo))) {
    return context.reject();
  }
  context.accept();
}

function keyServer(mode: NonNullable<FakeTvOptions['keyServer']>): HttpServer {
  return createHttpServer((request, response) => {
    if (mode === 'refusing' || request.url !== '/webos_rsa') {
      response.writeHead(404).end();
      return;
    }
    const body = mode === 'garbage' ? 'not a key at all' : devModeKeys().encrypted;
    response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(body);
  });
}

interface Device {
  options: FakeTvOptions;
  files: Map<string, Buffer>;
  received: Map<string, Buffer>;
  commands: string[];
  users: string[];
}

function answer(command: string, channel: ServerChannel, device: Device): void {
  const quoted = /"([^"]+)"/.exec(command)?.[1] ?? '';
  if (command.startsWith('/usr/bin/test -d')) return exit(channel, device.options.mkdirCode ?? 0);
  if (command.startsWith('/bin/rm -f')) {
    device.files.delete(quoted);
    return exit(channel, 0);
  }
  if (command.startsWith('/bin/cat >')) return receive(channel, quoted, device);
  if (command.startsWith('/usr/bin/luna-send-pub')) return luna(command, channel, device);
  channel.stderr.write(`sh: ${command}: not found\n`);
  exit(channel, 127);
}

function receive(channel: ServerChannel, path: string, device: Device): void {
  const chunks: Buffer[] = [];
  channel.on('data', (chunk: Buffer) => chunks.push(chunk));
  channel.on('end', () => {
    const data = Buffer.concat(chunks);
    device.files.set(path, data);
    device.received.set(path, data);
    exit(channel, 0);
  });
}

function luna(command: string, channel: ServerChannel, device: Device): void {
  const { options, files } = device;
  const param = JSON.parse(command.slice(command.indexOf("'") + 1, -1)) as { ipkUrl?: string };
  if (command.includes('luna://com.webos.appInstallService/dev/install')) {
    const replies = files.has(param.ipkUrl ?? '')
      ? (options.installReplies ?? DEFAULT_INSTALL)
      : [{ details: { state: 'FAILED', reason: 'no such file' } }];
    const text = replies.map((reply) => JSON.stringify(reply, null, 1)).join('\n');
    const half = Math.floor(text.length / 2);
    channel.write(text.slice(0, half));
    channel.write(`${text.slice(half)}\n`);
    if (options.installExits) exit(channel, 0);
    return;
  }
  if (command.includes('getSessionList')) {
    channel.write(`${JSON.stringify(options.sessionReply ?? { returnValue: false })}\n`);
    return exit(channel, 0);
  }
  channel.write(
    `${JSON.stringify(options.launchReply ?? { returnValue: true, processId: '1001' })}\n`,
  );
  exit(channel, 0);
}

function exit(channel: ServerChannel, code: number): void {
  setImmediate(() => {
    channel.exit(code);
    channel.end();
  });
}

function listen(server: SshServer | HttpServer): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function shut(server: SshServer | HttpServer): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
