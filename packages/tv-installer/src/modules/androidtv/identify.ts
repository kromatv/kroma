import type { UpnpDevice } from '../../discovery/upnp';
import type { Television } from '../../television';
import { adbDevice } from './adb';
import { isAndroid, philipsSystem } from './philips';
import { philipsAndroid } from './runtime';
import type { PhilipsSystem } from './schemas';

const ADB_PORT = 5555;
const PHILIPS_API_PORT = 1925;
const PHILIPS_TLS_PORT = 1926;

export const ANDROID_PORTS = {
  sweep: [PHILIPS_API_PORT, ADB_PORT],
  detail: [PHILIPS_TLS_PORT],
} as const;

export async function identifyAndroidTv(
  host: string,
  openPorts: ReadonlySet<number>,
  upnp?: UpnpDevice,
): Promise<Television | null> {
  const adbPort = openPorts.has(ADB_PORT) ? ADB_PORT : null;

  const philips = await philipsSystem(host, openPorts, {
    plain: PHILIPS_API_PORT,
    tls: PHILIPS_TLS_PORT,
  });
  if (philips) return identifyPhilips(host, philips, adbPort);

  return adbPort === null ? null : identifyAndroid(host, adbPort, upnp);
}

async function identifyPhilips(
  host: string,
  system: PhilipsSystem,
  adbPort: number | null,
): Promise<Television> {
  const android = isAndroid(system);
  const debugging = adbPort !== null;
  const device = adbPort === null ? null : await adbDevice(host, adbPort);
  const runtime = device?.runtime ?? philipsAndroid(system.os_type);
  return {
    host,
    platform: 'androidtv',
    vendor: 'Philips',
    name: system.name || 'Philips TV',
    model: system.model ?? '',
    developerMode: debugging ? 'on' : 'off',
    sideloadable: android || debugging,
    note: philipsNote(android, debugging, system.os_type),
    runtime,
  };
}

async function identifyAndroid(
  host: string,
  adbPort: number,
  upnp?: UpnpDevice,
): Promise<Television> {
  const device = await adbDevice(host, adbPort);
  const runtime = device?.runtime ?? null;
  return {
    host,
    platform: 'androidtv',
    vendor: device?.vendor || upnp?.manufacturer || 'Android TV',
    name: upnp?.friendlyName || device?.model || 'Android TV',
    model: device?.model || upnp?.modelName || '',
    developerMode: 'on',
    sideloadable: true,
    note: 'network debugging open on 5555',
    runtime,
  };
}

function philipsNote(android: boolean, debugging: boolean, osType: string | undefined): string {
  if (debugging) return 'Android TV, network debugging open on 5555';
  if (!android) {
    return `${osType ?? 'not Android'}: this Philips takes no sideloaded app, only its own store`;
  }
  return 'Android TV: About, click the build 7 times, then Developer options, Network debugging ON';
}
