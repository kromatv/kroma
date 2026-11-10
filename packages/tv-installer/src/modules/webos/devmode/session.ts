import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Client, type ClientChannel, type KexAlgorithm, type SFTPWrapper } from 'ssh2';

export const DEV_MODE_PORT = 9922;

const DEV_MODE_USER = 'prisoner';

const READY_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const NO_SUCH_HOST = new Set(['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT']);

const KEX: KexAlgorithm[] = [
  'diffie-hellman-group1-sha1',
  'ecdh-sha2-nistp256',
  'ecdh-sha2-nistp384',
  'ecdh-sha2-nistp521',
  'diffie-hellman-group-exchange-sha256',
  'diffie-hellman-group14-sha1',
];

interface SshTarget {
  host: string;
  port: number;
  privateKey: string;
}

interface Execution {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunningCommand {
  readonly exited: Promise<number>;
  close(): void;
}

/** One SSH session on a set in Dev Mode, as the ares tools open it. */
export interface DevModeSession {
  exec(command: string): Promise<Execution>;
  run(command: string): Promise<string>;
  stream(command: string, onData: (chunk: Buffer) => void): Promise<RunningCommand>;
  put(local: string, remote: string): Promise<void>;
  end(): void;
}

/** Opens a session as `prisoner`, refusing with what the user has to do on the set. */
export function openSession(target: SshTarget): Promise<DevModeSession> {
  const client = new Client();
  return new Promise((resolve, reject) => {
    client.once('ready', () => resolve(sessionOver(client)));
    client.once('error', (error) => {
      client.end();
      reject(new Error(refusal(target, error)));
    });
    client.connect({
      host: target.host,
      port: target.port,
      username: DEV_MODE_USER,
      privateKey: target.privateKey,
      readyTimeout: READY_TIMEOUT_MS,
      algorithms: { kex: KEX },
    });
  });
}

function refusal(target: SshTarget, error: Error & { level?: string; code?: string }): string {
  if (error.level === 'client-authentication') {
    return `${target.host} refused this computer's key: turn Key Server on in the Dev Mode app and give the passphrase it shows`;
  }
  if (error.level === 'client-timeout' || (error.code && NO_SUCH_HOST.has(error.code))) {
    return `nothing answered SSH on ${target.host}:${target.port}: open the Dev Mode app and turn Dev Mode on`;
  }
  return `the SSH session with ${target.host} failed: ${error.message}`;
}

function sessionOver(client: Client): DevModeSession {
  const open = (command: string, onData: Listener, onError: Listener = ignore) =>
    new Promise<Watched>((resolve, reject) => {
      client.exec(command, (error, channel) => {
        if (error) return reject(error);
        channel.stderr.on('data', onError);
        resolve({ channel, ...watch(channel, onData) });
      });
    });

  const stream = async (command: string, onData: Listener): Promise<RunningCommand> => {
    const { exited, close } = await open(command, onData);
    return { exited, close };
  };

  const exec = async (command: string): Promise<Execution> => {
    const stdout = bounded();
    const stderr = bounded();
    const code = await (await open(command, stdout.add, stderr.add)).exited;
    return { code, stdout: stdout.text(), stderr: stderr.text() };
  };

  const run = async (command: string) => {
    const { code, stdout, stderr } = await exec(command);
    if (code !== 0) throw new Error(`'${command}' exited with ${code}: ${stderr.trim()}`);
    return stdout;
  };

  const streamPut = async (local: string, remote: string) => {
    const { channel, exited } = await open(`/bin/cat > "${remote}"`, ignore);
    await pipeline(createReadStream(local), channel);
    const code = await exited;
    if (code !== 0) throw new Error(`the TV did not take ${remote}: cat exited with ${code}`);
  };

  const put = async (local: string, remote: string) => {
    const sftp = await new Promise<SFTPWrapper | null>((resolve) =>
      client.sftp((error, opened) => resolve(error ? null : opened)),
    );
    if (!sftp) return streamPut(local, remote);
    try {
      await pipeline(createReadStream(local), sftp.createWriteStream(remote));
    } finally {
      sftp.end();
    }
  };

  return { exec, run, stream, put, end: () => client.end() };
}

type Listener = (chunk: Buffer) => void;

interface Watched extends RunningCommand {
  channel: ClientChannel;
}

const ignore: Listener = () => undefined;

function watch(channel: ClientChannel, onData: Listener): RunningCommand {
  channel.on('data', onData);
  const exited = new Promise<number>((resolve) => {
    let code = 0;
    channel.once('exit', (status: number | null) => {
      code = status ?? 1;
    });
    channel.once('close', () => resolve(code));
  });
  return { exited, close: () => channel.close() };
}

function bounded(): { add: (chunk: Buffer) => void; text: () => string } {
  const chunks: Buffer[] = [];
  let size = 0;
  return {
    add: (chunk) => {
      size += chunk.byteLength;
      if (size <= MAX_OUTPUT_BYTES) chunks.push(chunk);
    },
    text: () => Buffer.concat(chunks).toString('utf8'),
  };
}
