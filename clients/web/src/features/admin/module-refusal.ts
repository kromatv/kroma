import type { StoreModule, StoreRefusal } from '@kromatv/client/modules';
import { useT } from '@kromatv/ui';

type Translate = ReturnType<typeof useT>;

const BARE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** A semver range as a reader writes it: a bare version is a floor, `>=` and `<=` are symbols. */
export function readableRange(range: string): string {
  const trimmed = range.trim();
  if (BARE.test(trimmed)) {
    return `≥ ${trimmed}`;
  }
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

type SchemaRefusal = Extract<StoreRefusal, { kind: 'schema' }>;
type CoreRefusal = Extract<StoreRefusal, { kind: 'coreSchema' | 'coreTable' }>;

function schemaText(refusal: SchemaRefusal, t: Translate) {
  return refusal.built > refusal.speaks
    ? t('admin.modulesRefusalSchemaNewer')
    : t('admin.modulesRefusalSchema');
}

function updateSchemaText(refusal: SchemaRefusal, version: string, t: Translate) {
  return refusal.built > refusal.speaks
    ? t('admin.modulesRefusalUpdateSchemaNewer', { version })
    : t('admin.modulesRefusalUpdateSchema', { version });
}

function coreText(refusal: CoreRefusal, t: Translate) {
  return refusal.kind === 'coreSchema'
    ? t('admin.modulesRefusalCoreSchema', { needs: refusal.needs, has: refusal.has })
    : t('admin.modulesRefusalCoreTable', { table: refusal.table, changed: refusal.changed });
}

function updateCoreText(refusal: CoreRefusal, version: string, t: Translate) {
  return refusal.kind === 'coreSchema'
    ? t('admin.modulesRefusalUpdateCoreSchema', { needs: refusal.needs, has: refusal.has, version })
    : t('admin.modulesRefusalUpdateCoreTable', {
        table: refusal.table,
        changed: refusal.changed,
        version,
      });
}

function entryText(refusal: StoreRefusal, t: Translate): string {
  switch (refusal.kind) {
    case 'engine':
      return engineText(refusal, t);
    case 'unknownEngine':
      return t('admin.modulesRefusalUnknownEngine', { engine: refusal.engine });
    case 'schema':
      return schemaText(refusal, t);
    case 'interface':
      return t('admin.modulesRefusalInterface', {
        built: refusal.built,
        implements: refusal.implements,
      });
    case 'coreSchema':
    case 'coreTable':
      return coreText(refusal, t);
    case 'native':
      return t('admin.modulesRefusalNative');
  }
}

function updateText(refusal: StoreRefusal, version: string, t: Translate): string {
  switch (refusal.kind) {
    case 'engine':
      return updateEngineText(refusal, version, t);
    case 'unknownEngine':
      return t('admin.modulesRefusalUpdateUnknownEngine', { engine: refusal.engine, version });
    case 'schema':
      return updateSchemaText(refusal, version, t);
    case 'interface':
      return t('admin.modulesRefusalUpdateInterface', {
        built: refusal.built,
        implements: refusal.implements,
        version,
      });
    case 'coreSchema':
    case 'coreTable':
      return updateCoreText(refusal, version, t);
    case 'native':
      return t('admin.modulesRefusalUpdateNative', { version });
  }
}

/**
 * What stands between a catalog entry and this server, worded in the reader's
 * language: the refusal of the entry itself, or of its update when an older
 * version is already installed and running. Null when nothing does, and when
 * the installed version is ahead of the catalog's.
 */
export function refusalText(m: StoreModule | undefined, t: Translate): string | null {
  if (!m || m.compatible || installedAhead(m)) {
    return null;
  }
  if (!m.refusal) {
    return m.reason ?? null;
  }
  return m.updateBlocked ? updateText(m.refusal, m.version, t) : entryText(m.refusal, t);
}

/** {@link refusalText} in the reader's language. */
export function useRefusalText(m: StoreModule | undefined): string | null {
  return refusalText(m, useT());
}

/**
 * When this server refuses the registry's newest version of a module and the
 * entry is an older one that runs instead, which newer version exists and what
 * it needs, in the reader's language. Null when the entry is the newest.
 */
export function newestText(m: StoreModule | undefined, t: Translate): string | null {
  const newest = m?.newest;
  if (!m || !newest) {
    return null;
  }
  return newestRefusalText(newest.refusal, { newest: newest.version, version: m.version }, t);
}

function newestRefusalText(
  refusal: StoreRefusal | null | undefined,
  { newest, version }: { newest: string; version: string },
  t: Translate,
): string {
  if (refusal?.kind === 'engine' && refusal.engine === 'server') {
    const range = readableRange(refusal.range);
    return t('admin.modulesNewestNeedsServer', {
      newest,
      range,
      serverVersion: refusal.serverVersion,
      version,
    });
  }
  if (refusal?.kind === 'coreSchema') {
    const { needs, has } = refusal;
    return t('admin.modulesNewestNeedsCore', { newest, needs, has, version });
  }
  return t('admin.modulesNewestRefused', { newest, version });
}

/** {@link newestText} in the reader's language. */
export function useNewestText(m: StoreModule | undefined): string | null {
  return newestText(m, useT());
}
