import { rm } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { run, runOk } from '../../shared/run';
import { requireTool } from '../../toolchain/detect';
import { booleanOption, type InstallContext, stringOption } from '../platform';
import { tizenAppId } from './app-id';
import { installFailure, refusedChain } from './install-failure';
import { installOverSdb } from './native';
import { readProfile, type SigningProfile } from './profiles';
import { SDB_PORT } from './sdb';
import { profileFor, readDuid, resign, type Signed } from './signing';
import { SDB, TIZEN_CLI } from './tools';

const CONNECT_TIMEOUT_MS = 25_000;
const INSTALL_TIMEOUT_MS = 300_000;

interface Package extends Partial<Signed> {
  path: string;
  profile: SigningProfile | null;
}

export function parseSdbSerial(devices: string, host: string): string | null {
  for (const line of devices.split('\n')) {
    const [serial = '', state = ''] = line.trim().split(/\s+/);
    if (serial.startsWith(`${host}:`) && state === 'device') return serial;
  }
  return null;
}

export async function installTizen(context: InstallContext): Promise<void> {
  const native = booleanOption(context.options, 'native') ?? true;
  const wgt = await sign(context);
  try {
    if (native) await installOverSdb(context, wgt.path, wgt.profile?.name ?? null);
    else await installOverCli(context, wgt);
  } finally {
    if (wgt.staged) await rm(dirname(wgt.path), { recursive: true, force: true });
  }
}

async function sign(context: InstallContext): Promise<Package> {
  const { artifact, log } = context;
  const named = stringOption(context.options, 'profile');
  const profile = named ? await namedProfile(named) : await profileFor(context.tv.host, log);
  return { ...(await resign(artifact, profile, log)), profile };
}

async function namedProfile(name: string): Promise<SigningProfile> {
  const profile = await readProfile(name);
  if (!profile) throw new Error(`no signing profile called ${name}`);
  return profile;
}

async function installOverCli(context: InstallContext, wgt: Package): Promise<void> {
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
    [tizen, 'install', '-n', basename(wgt.path), '--', dirname(wgt.path)],
    {
      log,
      timeoutMs: INSTALL_TIMEOUT_MS,
    },
  );
  if (installed.code !== 0) {
    const duid = refusedChain(installed.output) ? await readDuid(sdb, log) : null;
    throw new Error(installFailure(installed.output, wgt.profile?.name ?? null, duid));
  }
  if (!launch) return;

  const application = tizenAppId();
  const started = await run([tizen, 'run', '-p', application], { log });
  if (started.code !== 0) await run([sdb, 'shell', '0', 'was_execute', application], { log });
}
