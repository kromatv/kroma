import type { Runtime, Television } from '../../television';
import { type AppleTv, listAppleTvs, locateAppleTvTool } from './index';

/**
 * The sets this Mac is paired with rather than the ones on the network: an
 * Apple TV answers no probe, it is reached through CoreDevice. Empty on a
 * machine with no Xcode to ask, and on any refusal, because neither is a reason
 * for a scan to fail.
 */
export async function pairedTelevisions(): Promise<Television[]> {
  if (locateAppleTvTool('devicectl') === null) return [];
  try {
    return (await listAppleTvs()).map(asTelevision);
  } catch {
    return [];
  }
}

function asTelevision(set: AppleTv): Television {
  return {
    host: set.hostname || set.identifier,
    platform: 'appletv',
    vendor: 'Apple',
    name: set.name,
    model: set.model,
    developerMode: set.reachable ? 'on' : 'off',
    sideloadable: true,
    note: set.note,
    runtime: tvosRuntime(set.osVersion),
    identifier: set.identifier,
  };
}

function tvosRuntime(osVersion: string): Runtime | null {
  if (!osVersion) return null;
  return {
    name: 'tvOS',
    version: osVersion,
    engine: { name: 'React Native', version: null },
    learned: 'reported',
  };
}
