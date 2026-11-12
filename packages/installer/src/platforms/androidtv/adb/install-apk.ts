import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { AdbConnection } from './connection';
import { pushFile } from './sync';

const LARGEST_SHELL_ANSWER = 4 * 1024 * 1024;
const COPIED_APK = '/data/local/tmp/kroma.apk';

/** Runs a command on the TV and answers what it printed. */
export async function shell(connection: AdbConnection, command: string): Promise<string> {
  const stream = await connection.open(`shell:${command}`);
  try {
    return (await stream.readAll(LARGEST_SHELL_ANSWER)).toString('utf8');
  } finally {
    stream.close();
  }
}

async function streamed(
  connection: AdbConnection,
  apk: string,
  size: number,
  onChunk: (bytes: number) => void,
): Promise<string> {
  const stream = await connection.open(`exec:cmd package 'install' '-r' -S ${size}`);
  try {
    for await (const chunk of createReadStream(apk)) {
      const data = chunk as Buffer;
      await stream.write(data);
      onChunk(data.length);
    }
    return (await stream.readAll(LARGEST_SHELL_ANSWER)).toString('utf8');
  } finally {
    stream.close();
  }
}

async function copied(
  connection: AdbConnection,
  apk: string,
  onChunk: (bytes: number) => void,
): Promise<string> {
  await pushFile(connection, apk, COPIED_APK, onChunk);
  try {
    return await shell(connection, `pm install -r ${COPIED_APK}`);
  } finally {
    await shell(connection, `rm -f ${COPIED_APK}`).catch(() => '');
  }
}

/**
 * Installs an .apk over whatever build the TV has, the way `adb install -r`
 * does: streamed to the package manager when the TV has `cmd`, copied to it
 * first on older Android. Answers what the package manager printed.
 */
export async function installApk(
  connection: AdbConnection,
  apk: string,
  onProgress: (sent: number, total: number) => void = () => undefined,
): Promise<string> {
  const { size } = await stat(apk);
  let sent = 0;
  const onChunk = (bytes: number) => {
    sent += bytes;
    onProgress(sent, size);
  };
  return connection.banner.features.includes('cmd')
    ? streamed(connection, apk, size, onChunk)
    : copied(connection, apk, onChunk);
}
