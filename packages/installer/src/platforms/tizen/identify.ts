import { fetchJson } from '../../discovery/http';
import { localAddresses } from '../../discovery/lan';
import type { Television } from '../../shared/television';
import { type SamsungDeveloperMode, samsungReadiness } from './readiness';
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
  if (!openPorts.has(SAMSUNG_API_PORT)) {
    return null;
  }

  const info = await fetchJson(`http://${host}:${SAMSUNG_API_PORT}/api/v2/`, SamsungInfo);
  if (!info || !isTelevision(info)) {
    return null;
  }

  const mode = developerModeOf(info, openPorts);
  const { note, nextStep } = samsungReadiness(mode, host, localAddresses());
  return {
    host,
    platform: 'tizen',
    vendor: 'Samsung',
    name: unescapeName(info.device.name) || 'Samsung TV',
    model: info.device.modelName ?? '',
    developerMode: mode.declared || mode.sdb ? 'on' : 'off',
    sideloadable: true,
    note,
    ...(nextStep ? { nextStep } : {}),
    runtime: tizenRuntime(info.device.model),
  };
}

function developerModeOf(info: SamsungInfo, openPorts: ReadonlySet<number>): SamsungDeveloperMode {
  return {
    declared: info.device.developerMode === '1',
    sdb: openPorts.has(SDB_PORT),
    trusts: info.device.developerIP,
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
