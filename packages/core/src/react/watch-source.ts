import type { KromaClient } from '@kromatv/client';
import type { Capabilities, Capability, CapabilitySource } from '@kromatv/client/capabilities';
import type { WatchableApi } from '@kromatv/client/watchable';
import type { Translate } from '@kromatv/i18n';
import { useMemo, useState } from 'react';
import { watchSource, watchSources } from '../watchable-source';
import { useCapability } from './capability';

export interface WatchSources {
  offered: boolean | undefined;
  sources: readonly CapabilitySource[];
  source: CapabilitySource | null;
  choose: (mount: string) => void;
  api: WatchableApi | null | undefined;
}

const watchableCapability = (_: KromaClient, capabilities: Capabilities): Capability | null =>
  capabilities.watchable ?? null;

/**
 * Both `offered` and `api` are undefined until the map has been read, so a screen
 * offers nothing without yet saying this server cannot; `api` stays undefined
 * while a viewer is still choosing between several sources.
 */
export function useWatchSources(client: KromaClient | null, t: Translate): WatchSources {
  const capability = useCapability(client, watchableCapability);
  const [picked, choose] = useState<string | null>(null);
  const sources = useMemo(() => (capability ? watchSources(capability, t) : []), [capability, t]);
  const source = watchSource(sources, picked);
  const api = useMemo(() => {
    if (capability === null) return null;
    return client && source ? client.watchable.on(source.mount) : undefined;
  }, [client, capability, source]);
  const offered = capability === undefined ? undefined : capability !== null;
  return useMemo(
    () => ({ offered, sources, source, choose, api }),
    [offered, sources, source, api],
  );
}
