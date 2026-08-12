// The detail drawer's presentational sections: labels, the meta grid, the
// dependency/capability chips for catalog-only entries, the add-on list and
// the module's declared settings. The container and its actions live in
// module-detail.tsx.

import type { StoreCatalog, StoreModule } from '@kroma/core';
import { moduleIconUrl } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Badge, Box, DataField, Grid, Progress, Row, Text } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import type { AdminModule } from '#web/features/admin/module-api';
import { ModuleConfigForm } from '#web/features/admin/module-config-form';
import { DepChip, depState, ModuleDeps } from '#web/features/admin/module-deps';
import { type OpModule, opPct, PHASE_KEY, runningPct } from '#web/features/admin/module-ops';
import { useModuleSettingsPanels } from '#web/modules/ModuleHostProvider';
import { apiBase } from '#web/shared/lib/api';
import { Image } from '#web/shared/ui';

export function Label({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Text variant="overline" color="textDim" mb={8}>
      {children}
    </Text>
  );
}

export function Meta({ rows }: Readonly<{ rows: [string, ReactNode][] }>) {
  return (
    <Grid columns={2} gap={16} rowGap={12}>
      {rows.map(([k, v]) => (
        <DataField.Root key={k} size="sm">
          <DataField.Label>{k}</DataField.Label>
          <DataField.Value>{v}</DataField.Value>
        </DataField.Root>
      ))}
    </Grid>
  );
}

function DepChips({ entry, all }: Readonly<{ entry: StoreModule; all: AdminModule[] }>) {
  const t = useT();
  const byId = new Map(all.map((m) => [m.id, m]));
  const deps = [
    ...entry.dependsOn.map((d) => ({ ...d, optional: false })),
    ...entry.optionalDependsOn.map((d) => ({ ...d, optional: true })),
  ];
  if (deps.length === 0) return null;
  return (
    <Box>
      <Label>{t('admin.modulesDependsOn')}</Label>
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
  );
}

// What a catalog-only entry provides / needs provided, as neutral chips; the
// install dialog does the real satisfaction math.
function CapabilityChips({ entry }: Readonly<{ entry: StoreModule }>) {
  const t = useT();
  if (entry.provides.length === 0 && entry.requires.length === 0) return null;
  return (
    <Box gap={12}>
      {entry.provides.length > 0 && (
        <Box>
          <Label>{t('admin.modulesProvides')}</Label>
          <Row wrap gap={6}>
            {entry.provides.map((c) => (
              <Badge key={`${c.kind}:${c.id}`} tone="neutral">
                {c.kind}:{c.id}
              </Badge>
            ))}
          </Row>
        </Box>
      )}
      {entry.requires.length > 0 && (
        <Box>
          <Label>{t('admin.modulesRequires')}</Label>
          <Row wrap gap={6}>
            {entry.requires.map((r) => (
              <Badge key={`${r.kind}:${r.id ?? ''}`} tone="neutral">
                {r.id ? `${r.kind}:${r.id}` : r.kind}
              </Badge>
            ))}
          </Row>
        </Box>
      )}
    </Box>
  );
}

export function DepsSection({
  installed,
  entry,
  all,
}: Readonly<{
  installed: AdminModule | undefined;
  entry: StoreModule | undefined;
  all: AdminModule[];
}>) {
  if (installed) return <ModuleDeps module={installed} all={all} />;
  if (entry) {
    return (
      <>
        <DepChips entry={entry} all={all} />
        <CapabilityChips entry={entry} />
      </>
    );
  }
  return null;
}

// Reverse `dependsOn` edges from the catalog: modules built to plug into this
// one (e.g. download-engine sub-modules for the torrents host).
export function Addons({
  id,
  catalog,
}: Readonly<{ id: string; catalog: StoreCatalog | null | undefined }>) {
  const t = useT();
  const addons = (catalog?.modules ?? []).filter(
    (m) => m.id !== id && m.dependsOn.some((d) => d.id === id),
  );
  if (addons.length === 0) return null;
  return (
    <Box>
      <Label>{t('admin.modulesAddons')}</Label>
      <Row wrap gap={6}>
        {addons.map((m) => (
          <Badge key={m.id} tone={m.installedVersion ? 'success' : 'neutral'}>
            {m.name}
            {m.installedVersion
              ? ` (${t('admin.modulesInstalled').toLowerCase()})`
              : ` · v${m.version}`}
          </Badge>
        ))}
      </Row>
    </Box>
  );
}

export function DrawerSettings({
  module,
  onSaved,
}: Readonly<{ module: AdminModule; onSaved: () => void }>) {
  const t = useT();
  const { host, panels } = useModuleSettingsPanels(module.id);
  const fields = module.config ?? [];
  if (panels.length === 0 && fields.length === 0) return null;
  return (
    <Box>
      <Label>{t('admin.modulesSettings')}</Label>
      {host &&
        panels.map((p) => {
          const Panel = p.component;
          return (
            <Box key={p.id} mb={12}>
              <Panel host={host} />
            </Box>
          );
        })}
      {fields.length > 0 && (
        <ModuleConfigForm
          moduleId={module.id}
          fields={fields}
          values={module.configValues}
          onSaved={onSaved}
        />
      )}
    </Box>
  );
}

export function HeaderIcon({
  id,
  installed,
  icon,
}: Readonly<{ id: string; installed: boolean; icon: string | null | undefined }>) {
  const src = installed ? moduleIconUrl(id, apiBase()) : icon;
  return (
    <Box w={56} h={56} shrink={0} radius="xl" overflow="hidden" bg={src ? undefined : 'tint/5'}>
      {src ? <Image src={src} fit="cover" fill /> : null}
    </Box>
  );
}

export function FooterProgress({ op }: Readonly<{ op: OpModule }>) {
  const t = useT();
  const pct = opPct(op);
  return (
    <Box>
      <Row between mb={6}>
        <Text variant="meta" color="textDim">
          {t(PHASE_KEY[op.phase])}
        </Text>
        {pct !== null && (
          <Text variant="meta" color="textDim">
            {pct}%
          </Text>
        )}
      </Row>
      <Progress
        value={runningPct(op.phase, pct) / 100}
        thickness={5}
        color={op.phase === 'done' ? 'success' : 'accent'}
        rounded
      />
    </Box>
  );
}
