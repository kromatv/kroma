import { run, runOk } from '../../run';
import { requireTool } from '../../toolchain/detect';
import { type InstallContext, stringOption } from '../module';
import { webosAppId } from './app-id';
import { ARES, aresSibling } from './tools';

const DEV_PORT = '9922';
const DEV_USER = 'prisoner';
const INSTALL_TIMEOUT_MS = 300_000;

export function deviceName(host: string): string {
  return `kroma-${host.replaceAll('.', '-')}`;
}

export async function installWebos(context: InstallContext): Promise<void> {
  const { tv, artifact, log, launch } = context;
  const passphrase = stringOption(context.options, 'passphrase');
  const install = requireTool(ARES);
  const setup = aresSibling(install, 'ares-setup-device');
  const novacom = aresSibling(install, 'ares-novacom');
  const launcher = aresSibling(install, 'ares-launch');

  const device = deviceName(tv.host);
  await register(setup, device, tv.host, passphrase, log);
  if (passphrase) await run([novacom, '--device', device, '--getkey'], { log, timeoutMs: 60_000 });

  await runOk([install, artifact, '-d', device], { log, timeoutMs: INSTALL_TIMEOUT_MS });
  if (launch) await runOk([launcher, webosAppId(), '-d', device], { log });
}

async function register(
  setup: string,
  device: string,
  host: string,
  passphrase: string | undefined,
  log: InstallContext['log'],
): Promise<void> {
  const settings = [
    '-i',
    `host=${host}`,
    '-i',
    `port=${DEV_PORT}`,
    '-i',
    `username=${DEV_USER}`,
    '-i',
    `privatekey=${device}.pem`,
    ...(passphrase ? ['-i', `passphrase=${passphrase}`] : []),
  ];
  const added = await run([setup, '-a', device, ...settings], { log });
  if (added.code !== 0) await runOk([setup, '-m', device, ...settings], { log });
}
