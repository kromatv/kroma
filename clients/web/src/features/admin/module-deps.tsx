// Dependency chips for the admin Modules page: a module's hard + optional deps
// and the points it consumes (colored by whether each is answered), plus the
// reverse edges (who depends on this module).

import { depEntries } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Badge, type BadgeTone, Box, Row, Text } from '@kroma/ui/kit';
import type { AdminModule } from '#web/features/admin/module-api';

export type DepState = 'ok' | 'missing' | 'disabled' | 'optional';

export function depState(target: AdminModule | undefined, optional: boolean): DepState {
  if (!target) return optional ? 'optional' : 'missing';
  return target.enabled ? 'ok' : 'disabled';
}

const DEP_TONE: Record<DepState, BadgeTone> = {
  ok: 'success',
  missing: 'danger',
  disabled: 'neutral',
  optional: 'neutral',
};

export function DepChip({ label, state }: Readonly<{ label: string; state: DepState }>) {
  const t = useT();
  const suffix: Record<DepState, string> = {
    ok: '',
    missing: ` (${t('admin.modulesMissingSuffix')})`,
    disabled: ` (${t('admin.modulesDisabledSuffix')})`,
    optional: ` (${t('admin.modulesOptionalSuffix')})`,
  };
  return (
    <Badge tone={DEP_TONE[state]}>
      {label}
      {suffix[state]}
    </Badge>
  );
}

// The reverse edges of the dependency graph, so a contributor (e.g. Downloads)
// shows who needs it: a hard/optional `dependencies` on its id, or a `consumes`
// this module's `contributes` answers.
function dependents(module: AdminModule, all: AdminModule[]): AdminModule[] {
  const answers = module.contributes ?? [];
  return all.filter((other) => {
    if (other.id === module.id) return false;
    const deps = [...depEntries(other.dependencies), ...depEntries(other.optionalDependencies)];
    if (deps.some((d) => d.id === module.id)) return true;
    return (other.consumes ?? []).some((r) =>
      answers.some((c) => c.point === r.point && (!r.id || c.id === r.id)),
    );
  });
}

/** A module's dependency status in both directions: what it depends on
 * (colored by whether each is satisfied), plus what depends on it. */
type Need = { point: string; id?: string | null };

// The local half is what a reader recognises; the defining module's id is already
// visible as the module this need points at.
const label = (r: Need) => {
  const local = r.point.split('/').pop() ?? r.point;
  return r.id ? `${local}:${r.id}` : local;
};

// A need names a POINT, not a module: any enabled module that answers it
// satisfies it. Naming the one that currently does is the whole answer to "what
// is filling this?".
function contributor(all: AdminModule[], r: Need): AdminModule | undefined {
  return all.find(
    (m) =>
      m.enabled &&
      (m.contributes ?? []).some((c) => c.point === r.point && (!r.id || c.id === r.id)),
  );
}

export function ModuleDeps({ module, all }: Readonly<{ module: AdminModule; all: AdminModule[] }>) {
  const t = useT();
  const byId = new Map(all.map((m) => [m.id, m]));
  const deps = [
    ...depEntries(module.dependencies).map((d) => ({ ...d, optional: false })),
    ...depEntries(module.optionalDependencies).map((d) => ({ ...d, optional: true })),
  ];
  const reqs = module.consumes ?? [];
  const requiredBy = dependents(module, all);
  if (deps.length === 0 && reqs.length === 0 && requiredBy.length === 0) return null;
  return (
    <Box mt={8} gap={6}>
      {deps.length > 0 && (
        <Box gap={4}>
          <Text variant="overline" color="textDim">
            {t('admin.modulesDependsOn')}
          </Text>
          <Row wrap gap={6}>
            {deps.map((d) => (
              <DepChip
                key={d.id}
                label={d.version ? `${d.id}@${d.version}` : d.id}
                state={depState(byId.get(d.id), d.optional)}
              />
            ))}
          </Row>
        </Box>
      )}
      {reqs.length > 0 && (
        <Box gap={4}>
          <Text variant="overline" color="textDim">
            {t('admin.modulesNeeds')}
          </Text>
          <Row wrap gap={6}>
            {reqs.map((r) => {
              const by = contributor(all, r);
              return (
                <DepChip
                  key={`need:${r.point}:${r.id ?? ''}`}
                  label={by ? `${label(r)} · ${by.name}` : label(r)}
                  state={by ? 'ok' : 'missing'}
                />
              );
            })}
          </Row>
        </Box>
      )}
      {requiredBy.length > 0 && (
        <Box gap={4}>
          <Text variant="overline" color="textDim">
            {t('admin.modulesNeededBy')}
          </Text>
          <Row wrap gap={6}>
            {requiredBy.map((d) => (
              <DepChip key={d.id} label={d.name} state={d.enabled ? 'ok' : 'disabled'} />
            ))}
          </Row>
        </Box>
      )}
    </Box>
  );
}
