// Dependency chips for the admin Modules page: a module's hard + optional
// deps and capability requirements (colored by whether each is satisfied),
// plus the reverse edges (who depends on this module).

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

// The reverse edges of the dependency graph, so a provider (e.g. Downloads)
// shows who needs it: a hard/optional `dependsOn` on its id, or a capability
// `requires` this module's `provides` satisfies.
function dependents(module: AdminModule, all: AdminModule[]): AdminModule[] {
  const provides = module.provides ?? [];
  return all.filter((other) => {
    if (other.id === module.id) return false;
    const deps = [...depEntries(other.dependsOn), ...depEntries(other.optionalDependsOn)];
    if (deps.some((d) => d.id === module.id)) return true;
    return (other.requires ?? []).some((r) =>
      provides.some((c) => c.kind === r.kind && (!r.id || c.id === r.id)),
    );
  });
}

/** A module's dependency status in both directions: what it depends on
 * (colored by whether each is satisfied), plus what depends on it. */
type Requirement = { kind: string; id?: string | null };

const capability = (r: Requirement) => (r.id ? `${r.kind}:${r.id}` : r.kind);

// A requirement names a CAPABILITY, not a module: any enabled module that
// provides it satisfies it. Naming the one that currently does is the whole
// answer to "what is filling this?".
function provider(all: AdminModule[], r: Requirement): AdminModule | undefined {
  return all.find(
    (m) =>
      m.enabled && (m.provides ?? []).some((c) => c.kind === r.kind && (!r.id || c.id === r.id)),
  );
}

export function ModuleDeps({ module, all }: Readonly<{ module: AdminModule; all: AdminModule[] }>) {
  const t = useT();
  const byId = new Map(all.map((m) => [m.id, m]));
  const deps = [
    ...depEntries(module.dependsOn).map((d) => ({ ...d, optional: false })),
    ...depEntries(module.optionalDependsOn).map((d) => ({ ...d, optional: true })),
  ];
  const reqs = module.requires ?? [];
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
            {t('admin.modulesRequires')}
          </Text>
          <Row wrap gap={6}>
            {reqs.map((r) => {
              const by = provider(all, r);
              return (
                <DepChip
                  key={`cap:${r.kind}:${r.id ?? ''}`}
                  label={by ? `${capability(r)} · ${by.name}` : capability(r)}
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
            {t('admin.modulesRequiredBy')}
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
