import type { StoreModule, StoreRefusal } from '@kromatv/client/modules';
import { useT } from '@kromatv/ui';

type Translate = ReturnType<typeof useT>;

const BARE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** A semver range as a reader writes it: a bare version is a floor, `>=` and `<=` are symbols. */
export function readableRange(range: string): string {
  const trimmed = range.trim();
  if (BARE.test(trimmed)) return `≥ ${trimmed}`;
  return trimmed.replaceAll(/>=\s*/g, '≥ ').replaceAll(/<=\s*/g, '≤ ');
}

/** The installed version is the catalog's own, and this server refuses it. */
export function refusedAsInstalled(m: StoreModule): boolean {
  return !m.compatible && m.installedVersion === m.version;
}

const installedAhead = (m: StoreModule) =>
  !!m.installedVersion && !m.updateBlocked && m.installedVersion !== m.version;

function engineText(refusal: Extract<StoreRefusal, { kind: 'engine' }>, t: Translate) {
  const range = readableRange(refusal.range);
  return refusal.engine === 'server'
    ? t('admin.modulesRefusalEngine', { range, serverVersion: refusal.serverVersion })
    : t('admin.modulesRefusalEngineOther', { engine: refusal.engine, range });
}

function updateEngineText(
  refusal: Extract<StoreRefusal, { kind: 'engine' }>,
  version: string,
  t: Translate,
) {
  const range = readableRange(refusal.range);
  return refusal.engine === 'server'
    ? t('admin.modulesRefusalUpdate', { range, serverVersion: refusal.serverVersion, version })
    : t('admin.modulesRefusalUpdateEngineOther', { engine: refusal.engine, range, version });
}

function entryText(refusal: StoreRefusal, t: Translate): string {
  switch (refusal.kind) {
    case 'engine':
      return engineText(refusal, t);
    case 'unknownEngine':
      return t('admin.modulesRefusalUnknownEngine', { engine: refusal.engine });
    case 'schema':
      return refusal.built > refusal.speaks
        ? t('admin.modulesRefusalSchemaNewer')
        : t('admin.modulesRefusalSchema');
    case 'platform':
      return t('admin.modulesRefusalPlatform');
  }
}

function updateText(refusal: StoreRefusal, version: string, t: Translate): string {
  switch (refusal.kind) {
    case 'engine':
      return updateEngineText(refusal, version, t);
    case 'unknownEngine':
      return t('admin.modulesRefusalUpdateUnknownEngine', { engine: refusal.engine, version });
    case 'schema':
      return refusal.built > refusal.speaks
        ? t('admin.modulesRefusalUpdateSchemaNewer', { version })
        : t('admin.modulesRefusalUpdateSchema', { version });
    case 'platform':
      return t('admin.modulesRefusalUpdatePlatform', { version });
  }
}

/**
 * What stands between a catalog entry and this server, worded in the reader's
 * language: the refusal of the entry itself, or of its update when an older
 * version is already installed and running. Null when nothing does, and when
 * the installed version is ahead of the catalog's.
 */
export function refusalText(m: StoreModule | undefined, t: Translate): string | null {
  if (!m || m.compatible || installedAhead(m)) return null;
  if (!m.refusal) return m.reason ?? null;
  return m.updateBlocked ? updateText(m.refusal, m.version, t) : entryText(m.refusal, t);
}

/** {@link refusalText} in the reader's language. */
export function useRefusalText(m: StoreModule | undefined): string | null {
  return refusalText(m, useT());
}
