import type { MdnsService } from '../../discovery/mdns';
import type { UpnpDevice } from '../../discovery/upnp';
import type { Television } from '../../shared/television';
import { adbDevice } from './adb';
import { ADB_CONNECT_SERVICE, ADB_PORT, type AdbEndpoint } from './endpoint';
import { isAndroid, philipsSystem } from './philips';
import { philipsAndroid } from './runtime';
import type { PhilipsSystem } from './schemas';

const PHILIPS_API_PORT = 1925;
const PHILIPS_TLS_PORT = 1926;
const CAST_SERVICE = '_googlecast._tcp';

export const ANDROID_PORTS = {
  sweep: [PHILIPS_API_PORT, ADB_PORT],
  detail: [PHILIPS_TLS_PORT],
} as const;

export const ANDROID_SERVICES = [ADB_CONNECT_SERVICE, CAST_SERVICE] as const;

export async function identifyAndroidTv(
  host: string,
  openPorts: ReadonlySet<number>,
  upnp?: UpnpDevice,
  advertised: readonly MdnsService[] = [],
): Promise<Television | null> {
  const adb = endpointOf(openPorts, advertised);

  const philips = await philipsSystem(host, openPorts, {
    plain: PHILIPS_API_PORT,
    tls: PHILIPS_TLS_PORT,
  });
  if (philips) {
    return identifyPhilips(host, philips, adb);
  }
  if (adb === null) {
    return null;
  }
  if (!adb.wireless) {
    return identifyAndroid(host, adb, upnp);
  }

  const cast = advertised.some((service) => service.type === CAST_SERVICE);
  return identifyWireless(host, adb, upnp, cast);
}

function endpointOf(
  openPorts: ReadonlySet<number>,
  advertised: readonly MdnsService[],
): AdbEndpoint | null {
  if (openPorts.has(ADB_PORT)) {
    return { port: ADB_PORT, wireless: false };
  }
  const wireless = advertised.find((service) => service.type === ADB_CONNECT_SERVICE);
  return wireless ? { port: wireless.port, wireless: true } : null;
}

async function identifyPhilips(
  host: string,
  system: PhilipsSystem,
  adb: AdbEndpoint | null,
): Promise<Television> {
  const android = isAndroid(system);
  const device = adb === null ? null : await adbDevice(host, adb.port);
  const runtime = device?.runtime ?? philipsAndroid(system.os_type);
  return {
    host,
    platform: 'androidtv',
    vendor: 'Philips',
    name: system.name || 'Philips TV',
    model: system.model ?? '',
    developerMode: adb === null ? 'off' : 'on',
    sideloadable: android || adb !== null,
    note: philipsNote(android, adb, system.os_type),
    runtime,
  };
}

async function identifyAndroid(
  host: string,
  adb: AdbEndpoint,
  upnp?: UpnpDevice,
): Promise<Television> {
  const device = await adbDevice(host, adb.port);
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

async function identifyWireless(
  host: string,
  adb: AdbEndpoint,
  upnp: UpnpDevice | undefined,
  cast: boolean,
): Promise<Television | null> {
  const device = await adbDevice(host, adb.port);
  if (!device?.tv && !upnp && !cast) {
    return null;
  }
  return {
    host,
    platform: 'androidtv',
    vendor: device?.vendor || upnp?.manufacturer || 'Android TV',
    name: upnp?.friendlyName || device?.model || 'Android TV',
    model: device?.model || upnp?.modelName || '',
    developerMode: 'on',
    sideloadable: true,
    note: device
      ? 'Wireless debugging on, paired with this computer'
      : 'Wireless debugging on, asks for a pairing code',
    runtime: device?.runtime ?? null,
  };
}

function philipsNote(
  android: boolean,
  adb: AdbEndpoint | null,
  osType: string | undefined,
): string {
  if (adb?.wireless) {
    return 'Android TV, Wireless debugging on';
  }
  if (adb) {
    return 'Android TV, network debugging open on 5555';
  }
  if (!android) {
    return `${osType ?? 'not Android'}: this Philips takes no sideloaded app, only its own store`;
  }
  return 'Android TV: About, click the build 7 times, then Developer options, Network debugging ON';
}
