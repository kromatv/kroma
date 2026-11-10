import { type InstallContext, stringOption } from '../platform';
import { webosAppId } from './app-id';
import { installIpk } from './devmode/install-ipk';
import { DEFAULT_KEY_STORE, devModeKey, type KeyStore } from './devmode/key';
import { launchApp } from './devmode/launch';
import { DEV_MODE_PORT, openSession } from './devmode/session';

export interface DevModePorts extends KeyStore {
  sshPort: number;
}

const DEFAULT_PORTS: DevModePorts = { ...DEFAULT_KEY_STORE, sshPort: DEV_MODE_PORT };

/**
 * Installs over the set's Dev Mode SSH, the way the ares tools do, with this
 * tool's own client: nothing from LG has to be on the machine.
 */
export async function installWebos(
  context: InstallContext,
  ports: DevModePorts = DEFAULT_PORTS,
): Promise<void> {
  const { tv, artifact, log, launch } = context;
  const privateKey = await devModeKey(tv.host, stringOption(context.options, 'passphrase'), ports);

  const session = await openSession({ host: tv.host, port: ports.sshPort, privateKey });
  try {
    const state = await installIpk(session, artifact, log);
    log(state);
    if (launch) await launchApp(session, webosAppId());
  } finally {
    session.end();
  }
}
