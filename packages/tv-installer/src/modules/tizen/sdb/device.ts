import { basename } from 'node:path';
import type { LogLine } from '../../../run';
import { type Capability, readCapability } from './capability';
import {
  installCommands,
  launchCommands,
  PACKAGE_TEMP_DIR,
  PACKAGE_TEMP_DIR_QUERY,
  packageIdOf,
  remotePath,
  removeCommands,
  uninstallCommands,
} from './commands';
import { type ConnectionOptions, SDB_PORT, SdbConnection } from './connection';
import { describeResult, parseResult, type SdbResult } from './result';
import { type ShellOptions, shell } from './shell';
import { type PushOptions, pushFile } from './sync';

const ABSOLUTE_PATH = /^\/[A-Za-z0-9._/-]+$/;
const UNSUPPORTED = /(command not found|unknown command|not supported|invalid command|usage:)/i;
const NOTHING_RAN: SdbResult = {
  verdict: 'failure',
  code: null,
  output: 'no command was accepted',
};

export interface InstallOptions {
  appId: string;
  type?: string;
  log?: LogLine;
  onProgress?: (sent: number, total: number) => void;
}

export interface SdbDevice {
  readonly host: string;
  readonly port: number;
  readonly banner: string;
  capability(): Promise<Capability>;
  shell(command: string, options?: ShellOptions): Promise<string>;
  push(localPath: string, remote: string, options?: PushOptions): Promise<void>;
  install(artifact: string, options: InstallOptions): Promise<SdbResult>;
  launch(appId: string): Promise<SdbResult>;
  uninstall(packageId: string): Promise<SdbResult>;
  close(): void;
}

export interface DeviceInfo {
  host: string;
  port: number;
  reachable: boolean;
  name: string;
  profile: string;
  platformVersion: string;
}

/** Opens one device on its sdb port. Nothing else needs to be installed to reach it. */
export async function connect(
  host: string,
  port = SDB_PORT,
  options: ConnectionOptions = {},
): Promise<SdbDevice> {
  const connection = await SdbConnection.open(host, port, options);
  let capability: Capability | null = null;

  const capabilities = async () => {
    capability ??= await readCapability(connection);
    return capability;
  };

  const attempt = async (commands: readonly string[], log?: LogLine): Promise<SdbResult> => {
    let fallback: SdbResult | null = null;
    for (const command of commands) {
      log?.(`> ${command}`);
      const result = parseResult(await shell(connection, command));
      log?.(describeResult(command, result));
      if (result.verdict === 'success') return result;
      if (result.verdict === 'failure' && !UNSUPPORTED.test(result.output)) return result;
      fallback ??= result;
    }
    return fallback ?? NOTHING_RAN;
  };

  const remove = async (path: string): Promise<void> => {
    for (const command of removeCommands(path)) {
      const result = parseResult(await shell(connection, command, { limit: 4096 }));
      if (result.verdict !== 'failure') return;
    }
  };

  return {
    host,
    port,
    banner: connection.banner,
    capability: capabilities,
    shell: (command, shellOptions) => shell(connection, command, shellOptions),
    push: (localPath, remote, pushOptions) => pushFile(connection, localPath, remote, pushOptions),
    launch: (appId) => attempt(launchCommands(appId)),
    uninstall: (packageId) => attempt(uninstallCommands(packageId)),
    close: () => connection.close(),

    async install(artifact, { appId, type = 'wgt', log, onProgress }) {
      const directory = await temporaryDirectory(connection, await capabilities());
      const remote = remotePath(directory, basename(artifact));
      log?.(`pushing ${basename(artifact)} to ${remote}`);
      await pushFile(connection, artifact, remote, { onProgress });

      const result = await attempt(installCommands(packageIdOf(appId), remote, type), log);
      await remove(remote).catch(() => undefined);
      return result;
    },
  };
}

/** Which of these hosts answers on the sdb port, and what each one says it is. */
export async function devices(
  hosts: readonly string[],
  port = SDB_PORT,
  options: ConnectionOptions = {},
): Promise<DeviceInfo[]> {
  return Promise.all(hosts.map((host) => describe(host, port, options)));
}

async function describe(
  host: string,
  port: number,
  options: ConnectionOptions,
): Promise<DeviceInfo> {
  const blank = { host, port, reachable: false, name: '', profile: '', platformVersion: '' };
  try {
    const connection = await SdbConnection.open(host, port, options);
    try {
      const capability = await readCapability(connection);
      return {
        host,
        port,
        reachable: true,
        name: capability.device_name ?? '',
        profile: capability.profile_name ?? '',
        platformVersion: capability.platform_version ?? '',
      };
    } finally {
      connection.close();
    }
  } catch {
    return blank;
  }
}

async function temporaryDirectory(
  connection: SdbConnection,
  capability: Capability,
): Promise<string> {
  const advertised = capability.sdk_toolpath?.trim();
  if (advertised && ABSOLUTE_PATH.test(advertised)) return advertised;

  const queried = (await shell(connection, PACKAGE_TEMP_DIR_QUERY, { limit: 512 })).trim();
  return ABSOLUTE_PATH.test(queried) ? queried : PACKAGE_TEMP_DIR;
}
