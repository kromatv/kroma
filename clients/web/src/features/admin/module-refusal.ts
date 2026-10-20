import type { StoreModule } from '@kromatv/client/modules';
import { useT } from '@kromatv/ui';

type Translate = ReturnType<typeof useT>;

const BARE = /^\d+\.\d+\.\d+$/;

const readableRange = (range: string) =>
  BARE.test(range.trim())
    ? `≥ ${range.trim()}`
    : range.replaceAll('>=', '≥ ').replaceAll('<=', '≤ ');

/**
 * What stands between a catalog entry and this server, worded in the reader's
 * language: the refusal of the entry itself, or of its update when an older
 * version is already installed and running. Null when nothing does.
 */
export function refusalText(m: StoreModule | undefined, t: Translate): string | null {
  if (!m || m.compatible) return null;
  const refusal = m.refusal;
  if (!refusal) return m.reason ?? null;
  switch (refusal.kind) {
    case 'engine': {
      const values = { range: readableRange(refusal.range), serverVersion: refusal.serverVersion };
      return m.updateBlocked
        ? t('admin.modulesRefusalUpdate', { ...values, version: m.version })
        : t('admin.modulesRefusalEngine', values);
    }
    case 'unknownEngine':
      return t('admin.modulesRefusalUnknownEngine', { engine: refusal.engine });
    case 'schema':
      return t('admin.modulesRefusalSchema');
    case 'platform':
      return t('admin.modulesRefusalPlatform');
  }
}

/** {@link refusalText} in the reader's language. */
export function useRefusalText(m: StoreModule | undefined): string | null {
  return refusalText(m, useT());
}
