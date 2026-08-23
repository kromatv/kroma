import { rm } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { run, runOk } from '../../run';
import { locate, requireTool } from '../../toolchain/detect';
import { booleanOption, type InstallContext, stringOption } from '../module';
import { tizenAppId } from './app-id';
import { installOverSdb } from './native';
import { readProfile, type SigningProfile } from './profiles';
import { SDB_PORT } from './sdb';
import { ensureProfile, readDuid, resign, type Signed } from './signing';
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
  const native = booleanOption(context.options, 'native') ?? locate(SDB) === null;
  const wgt = await sign(context);
  try {
    if (native) await installOverSdb(context, wgt.path);
    else await installOverCli(context, wgt);
  } finally {
    if (wgt.staged) await rm(dirname(wgt.path), { recursive: true, force: true });
  }
}

async function sign(context: InstallContext): Promise<Package> {
  const { artifact, log } = context;
  const named = stringOption(context.options, 'profile');
  const profile = named ? await namedProfile(named) : await ensureProfile(log);
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
    const duid = installed.output.includes('certificate') ? await readDuid(sdb, log) : null;
    throw new Error(installFailure(installed.output, wgt.profile?.name ?? null, duid));
  }
  if (!launch) return;

  const application = tizenAppId();
  const started = await run([tizen, 'run', '-p', application], { log });
  if (started.code !== 0) await run([sdb, 'shell', '0', 'was_execute', application], { log });
}

export function installFailure(
  output: string,
  profile: string | null,
  duid: string | null,
): string {
  if (!output.includes('certificate')) {
    const tail = output.split('\n').filter(Boolean).slice(-2).join(' / ');
    const said = tail ? `: ${tail}` : '';
    return `the install failed${said}`;
  }
  const rejected = profile ? `profile ${profile} signed it and the set refused that chain. ` : '';
  const set = duid ? ` The DUID to register is ${duid}.` : '';
  return `${rejected}A retail Samsung takes only a distributor certificate Samsung issued for its own DUID: Tizen Studio, Certificate Manager, Samsung, TV, with the set connected.${set}`;
}
