import type { UpnpDevice } from '../../discovery/upnp';
import type { Television } from '../../television';
import { webosRuntime } from './runtime';

const DEV_PORT = 9922;
const APP_PORT = 3000;

export const WEBOS_PORTS = {
  sweep: [DEV_PORT],
  detail: [APP_PORT],
} as const;

// A webOS set answers its own SSDP target with its own name even when DIAL is asleep.
export const WEBOS_SEARCH_TARGET = 'urn:lge-com:service:webos-second-screen:1';

export async function identifyWebos(
  host: string,
  openPorts: ReadonlySet<number>,
  upnp?: UpnpDevice,
): Promise<Television | null> {
  const devMode = openPorts.has(DEV_PORT);
  if (!looksWebos(devMode, upnp)) return null;

  const runtime = webosRuntime([upnp?.modelName, upnp?.modelNumber, upnp?.friendlyName]);
  const seen = devMode
    ? 'Dev Mode running, key server on 9922'
    : 'Dev Mode app not running: install it from the LG Content Store, log in, Dev Mode ON and Key Server ON';
  return {
    host,
    platform: 'webos',
    vendor: 'LG',
    name: upnp?.friendlyName || 'LG TV',
    model: upnp?.modelName ?? '',
    developerMode: devMode ? 'on' : 'off',
    sideloadable: true,
    note: seen,
    runtime,
  };
}

function looksWebos(devMode: boolean, upnp?: UpnpDevice): boolean {
  if (devMode) return true;
  const vendor = `${upnp?.manufacturer ?? ''} ${upnp?.friendlyName ?? ''}`.toLowerCase();
  return vendor.includes('lg electronics') || vendor.includes('webos');
}
