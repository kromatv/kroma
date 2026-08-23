import { devicectl } from './devicectl';
import { type Device, DeviceList } from './schemas';

const LIST_TIMEOUT_MS = 30_000;
const TVOS = 'tvOS';

/**
 * `identifier` is what `devicectl --device` takes; `udid` is the hardware id
 * `xcodebuild` and `expo run:ios --device` take.
 */
export interface AppleTv {
  identifier: string;
  udid: string;
  hostname: string;
  name: string;
  model: string;
  osVersion: string;
  reachable: boolean;
  note: string;
}

/** The Apple TVs in a `devicectl list devices --json-output` document. */
export function readAppleTvs(report: unknown): AppleTv[] {
  return DeviceList.parse(report)
    .result.devices.filter((device) => device.hardwareProperties?.platform === TVOS)
    .map(describe);
}

/** Every Apple TV this Mac is paired with, the ones it cannot reach right now included. */
export async function listAppleTvs(): Promise<AppleTv[]> {
  const { code, output, report } = await devicectl(['list', 'devices'], {
    timeoutMs: LIST_TIMEOUT_MS,
  });
  if (code !== 0) throw new Error(`devicectl could not list the paired devices: ${output.trim()}`);
  return readAppleTvs(report);
}

function describe(device: Device): AppleTv {
  const connection = device.connectionProperties;
  const hardware = device.hardwareProperties;
  return {
    identifier: device.identifier,
    udid: hardware?.udid ?? '',
    hostname: connection?.potentialHostnames?.[0] ?? '',
    name: device.deviceProperties?.name ?? '',
    model: hardware?.marketingName ?? hardware?.productType ?? '',
    osVersion: device.deviceProperties?.osVersionNumber ?? '',
    ...reach(connection),
  };
}

function reach(connection: Device['connectionProperties']): { reachable: boolean; note: string } {
  if (connection?.pairingState !== 'paired') {
    return {
      reachable: false,
      note: 'not paired with this Mac: pair it again in Xcode, Window then Devices and Simulators',
    };
  }
  if (!connection.transportType || connection.tunnelState === 'unavailable') {
    return { reachable: false, note: 'off the network: wake it and put it back on this Wi-Fi' };
  }
  return { reachable: true, note: `reachable over ${connection.transportType}` };
}
