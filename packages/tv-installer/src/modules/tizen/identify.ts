import { fetchJson } from '../../discovery/http';
import type { Television } from '../../television';
import { tizenRuntime } from './runtime';
import { SamsungInfo } from './schemas';
import { SDB_PORT } from './sdb';

export const SAMSUNG_API_PORT = 8001;

export const TIZEN_PORTS = {
  sweep: [SAMSUNG_API_PORT],
  detail: [SDB_PORT],
} as const;

export async function identifyTizen(
  host: string,
  openPorts: ReadonlySet<number>,
): Promise<Television | null> {
  if (!openPorts.has(SAMSUNG_API_PORT)) return null;

  const info = await fetchJson(`http://${host}:${SAMSUNG_API_PORT}/api/v2/`, SamsungInfo);
  if (!info || !isTelevision(info)) return null;

  const sdb = openPorts.has(SDB_PORT);
  const declared = info.device.developerMode === '1';
  const runtime = tizenRuntime(info.device.model);
  const seen =
    declared || sdb
      ? samsungNote(sdb, info.device.developerIP)
      : 'Developer mode off: on the TV open Apps and type 1 2 3 4 5, switch it on, set this computer as host PC, reboot';
  return {
    host,
    platform: 'tizen',
    vendor: 'Samsung',
    name: unescapeName(info.device.name) || 'Samsung TV',
    model: info.device.modelName ?? '',
    developerMode: declared || sdb ? 'on' : 'off',
    sideloadable: true,
    note: seen,
    runtime,
  };
}

// A Samsung soundbar answers the same API and calls itself a SmartTV. The audio
// range is the HW- models, and their internal model name ends in SPK.
function isTelevision(info: SamsungInfo): boolean {
  const { ModelNumber = '', model = '' } = info.device;
  return !ModelNumber.startsWith('HW-') && !/SPK/i.test(model);
}

// The set reports the name its owner typed, HTML-escaped: `75&quot; The Frame`.
function unescapeName(name: string | undefined): string {
  const entities: Record<string, string> = {
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
  };
  return (name ?? '').replace(
    /&(?:quot|apos|#39|lt|gt|amp);/g,
    (entity) => entities[entity] ?? entity,
  );
}

function samsungNote(sdb: boolean, trusts: string | undefined): string {
  const host = trusts ? `host PC ${trusts}` : 'no host PC set';
  return sdb ? `sdb open, ${host}` : `developer mode on, ${host}, sdb closed until the TV reboots`;
}
