import type { Capability, CapabilitySource } from '@kromatv/client/capabilities';
import type { Translate } from '@kromatv/i18n';

/** What a capability that declares no source is read as: the figures and the
 * slice map every download sent before a source could name its own. */
export function impliedSource(mount: string, t: Translate): CapabilitySource {
  return {
    mount,
    label: t('requests.watchSourceDownload'),
    icon: 'download',
    figures: [
      { key: 'downloaded', label: t('requests.watchStatDownloaded'), kind: 'percent' },
      { key: 'speed', label: t('requests.watchStatSpeed'), kind: 'rate' },
      { key: 'sources', label: t('requests.watchStatPeers'), kind: 'ratio' },
    ],
    map: { label: t('requests.watchPieces') },
    actions: [],
  };
}

export function watchSources(
  capability: Capability | null,
  t: Translate,
): readonly CapabilitySource[] {
  if (!capability) return [];
  const declared = capability.sources ?? [];
  return declared.length > 0 ? declared : [impliedSource(capability.mount, t)];
}

export function watchSource(
  sources: readonly CapabilitySource[],
  mount: string | null,
): CapabilitySource | null {
  if (sources.length === 1) return sources[0] ?? null;
  return sources.find((source) => source.mount === mount) ?? null;
}

export function watchAction(source: CapabilitySource | null, key: string): string | null {
  return source?.actions.find((action) => action.key === key)?.label ?? null;
}
