import type { MessageKey, Translate } from '@kromatv/i18n';
import {
  type ModuleAccess,
  type PermissionAccess,
  type PermissionCategory,
  type PermissionGroup,
  permissionGroups,
  type PermissionSource,
  tileGroups,
} from '#web/features/admin/module-permissions';
import { mergeSources } from '#web/features/admin/module-permissions-sources';
import { listOf, opening } from '#web/features/admin/module-permissions-words';

const LINES_SHOWN = 3;

type Clause = 'host' | 'diskWrite' | 'diskRead';

const CLAUSE: Record<Clause, readonly [first: MessageKey, then: MessageKey]> = {
  host: ['modulePermissions.verdictHostFirst', 'modulePermissions.verdictHost'],
  diskWrite: ['modulePermissions.verdictDiskWriteFirst', 'modulePermissions.verdictDiskWrite'],
  diskRead: ['modulePermissions.verdictDiskReadFirst', 'modulePermissions.verdictDiskRead'],
};

function clauseOf(group: PermissionGroup): Clause {
  if (group.category === 'host') return 'host';
  return group.access === 'write' ? 'diskWrite' : 'diskRead';
}

/** What reaches past a module's isolation, as the clauses of one sentence:
 *  the programs it starts, the server's own connection, the whole disk. Empty
 *  for a module that stays inside it. */
export function extendedReasons(source: PermissionSource, t: Translate): string[] {
  const programs = source.permissions.run ?? [];
  return permissionGroups(source, t)
    .filter((group) => group.extended)
    .map((group, at) => {
      if (group.category === 'run') {
        return t('modulePermissions.verdictRun', { programs: listOf(programs, t) });
      }
      const [first, then] = CLAUSE[clauseOf(group)];
      return t(at === 0 ? first : then);
    });
}

/** The one sentence a module's security card opens with when it reaches past
 *  its isolation, or null when it does not. */
export function extendedSentence(source: PermissionSource, t: Translate): string | null {
  const reasons = extendedReasons(source, t);
  if (reasons.length === 0) return null;
  return t('modulePermissions.verdictExtended', { reasons: opening(listOf(reasons, t)) });
}

/** A kind of access several modules of an install may share, said once. */
export interface SharedAccess {
  category: PermissionCategory;
  access: PermissionAccess | null;
  brief: string;
  modules: readonly string[];
}

/** What an install lets its modules do, said once for all of them: one line
 *  per module that reaches past its isolation, then the few kinds of access
 *  that weigh most, each with the modules that have it. */
export function consentOverview(
  entries: readonly ModuleAccess[],
  t: Translate,
): { extended: { id: string; line: string }[]; shared: SharedAccess[] } {
  const declared = entries.flatMap((entry) =>
    entry.source ? [{ ...entry, source: entry.source }] : [],
  );
  const extended = declared.flatMap(({ id, name, source }) => {
    const reasons = extendedReasons(source, t);
    if (reasons.length === 0) return [];
    return [{ id, line: t('modulePermissions.extendedBy', { name, reasons: listOf(reasons, t) }) }];
  });
  const reached = declared.map(({ name, source }) => ({
    name,
    categories: new Set(permissionGroups(source, t).map((group) => group.category)),
  }));
  const merged = permissionGroups(mergeSources(declared.map(({ source }) => source)), t);
  const shared = tileGroups(merged)
    .slice(0, LINES_SHOWN)
    .map(({ category, access, brief }) => ({
      category,
      access,
      brief,
      modules: reached.filter((one) => one.categories.has(category)).map((one) => one.name),
    }));
  return { extended, shared };
}
