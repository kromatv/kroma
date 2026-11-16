import { rm } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { run, runOk } from '../../shared/run';
import type { Television } from '../../shared/television';
import { requireTool } from '../../toolchain/detect';
import {
  booleanOption,
  type InstallContext,
  type PlatformOptions,
  stringOption,
} from '../platform';
import { eitherAuthor } from './either-author';
import { installFailure, refusedChain } from './install-failure';
import { installOverSdb } from './native';
import { readProfile, type SigningProfile } from './profiles';
import { reach } from './reach';
import { SDB_PORT } from './sdb';
import { profileFor, readDuid, resign, type Signed } from './signing';
import { SDB, TIZEN_CLI } from './tools';

const CONNECT_TIMEOUT_MS = 25_000;
const INSTALL_TIMEOUT_MS = 300_000;

interface Package extends Signed {
  profile: SigningProfile;
}

export function parseSdbSerial(devices: string, host: string): string | null {
  for (const line of devices.split('\n')) {
    const [serial = '', state = ''] = line.trim().split(/\s+/);
    if (serial.startsWith(`${host}:`) && state === 'device') {
      return serial;
    }
  }
  return null;
}

export async function installTizen(context: InstallContext): Promise<PlatformOptions> {
  await refusedAsScanned(context.tv);
  const named = stringOption(context.options, 'profile');
  const chosen = named ? await namedProfile(named) : await profileFor(context.tv.host, context.log);
  return eitherAuthor(context, chosen, (profile) => installAs(context, profile));
}

async function refusedAsScanned(tv: Television): Promise<void> {
  if (!tv.nextStep) {
    return;
  }
  const device = await reach(tv.host).catch((error: unknown) => {
    throw new Error(tv.note, { cause: error });
  });
  device.close();
}

async function installAs(context: InstallContext, profile: SigningProfile): Promise<void> {
  const native = booleanOption(context.options, 'native') ?? true;
  const signed = { ...(await resign(context.artifact, profile, context.log)), profile };
  try {
    if (native) {
      await installOverSdb(context, signed.path, signed.package, profile.name);
    } else {
      await installOverCli(context, signed);
    }
  } finally {
    if (signed.staged) {
      await rm(dirname(signed.path), { recursive: true, force: true });
    }
  }
}

async function namedProfile(name: string): Promise<SigningProfile> {
  const profile = await readProfile(name);
  if (!profile) {
    throw new Error(`no signing profile called ${name}`);
  }
  return profile;
}

async function installOverCli(context: InstallContext, signed: Package): Promise<void> {
  const { tv, log, launch } = context;
  const sdb = requireTool(SDB);
  const tizen = requireTool(TIZEN_CLI);

  // One device at a time: the Tizen CLI picks the single connected target
  // itself, and its `-t` lookup does not match an ip:port serial.
  await run([sdb, 'disconnect'], { log });
  await runOk([sdb, 'connect', `${tv.host}:${SDB_PORT}`], { log, timeoutMs: CONNECT_TIMEOUT_MS });

  const serial = parseSdbSerial(await runOk([sdb, 'devices'], { log }), tv.host);
  if (!serial) {
    throw new Error(
      'the TV refused the connection: Developer mode must list this computer as the host PC, and the set must have been rebooted since',
    );
  }

  const installed = await run(
    [tizen, 'install', '-n', basename(signed.path), '--', dirname(signed.path)],
    {
      log,
      timeoutMs: INSTALL_TIMEOUT_MS,
    },
  );
  if (installed.code !== 0) {
    const duid = refusedChain(installed.output) ? await readDuid(sdb, log) : null;
    throw installFailure(installed.output, signed.profile.name, duid);
  }
  if (!launch) {
    return;
  }

  const application = signed.package.appId;
  const started = await run([tizen, 'run', '-p', application], { log });
  if (started.code !== 0) {
    await run([sdb, 'shell', '0', 'was_execute', application], { log });
  }
}
