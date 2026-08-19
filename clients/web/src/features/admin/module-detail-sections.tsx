// The module page's presentational sections: labels, the meta grid, the
// dependency/capability chips for catalog-only entries, the add-on list and
// the module's declared settings. The page itself lives in module-detail.tsx,
// its controls in module-detail-actions.tsx.

import type { StoreCatalog, StoreModule } from '@kroma/core';
import { depEntries, moduleIconUrl } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Badge, Box, Button, Callout, DataField, Grid, Progress, Row, Text } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import type { AdminModule } from '#web/features/admin/module-api';
import { ModuleConfigForm } from '#web/features/admin/module-config-form';
import { DepChip, depState, ModuleDeps } from '#web/features/admin/module-deps';
import {
  type ModuleRestart,
  type OpModule,
  opPct,
  PHASE_KEY,
  runningPct,
} from '#web/features/admin/module-ops';
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
    ...depEntries(entry.dependencies).map((d) => ({ ...d, optional: false })),
    ...depEntries(entry.optionalDependencies).map((d) => ({ ...d, optional: true })),
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

// Reverse `dependencies` edges from the catalog: modules built to plug into this
// one (e.g. download-engine sub-modules for the torrents host).
export function Addons({
  id,
  catalog,
}: Readonly<{ id: string; catalog: StoreCatalog | null | undefined }>) {
  const t = useT();
  const addons = (catalog?.modules ?? []).filter(
    (m) => m.id !== id && Object.hasOwn(m.dependencies, id),
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

export function ModuleSettings({
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

function restartState(module: AdminModule, restart: ModuleRestart) {
  if (restart.error) {
    return { tone: 'danger', icon: 'alert-triangle', title: 'admin.modulesRestartFailed' } as const;
  }
  if (!module.running) {
    return { tone: 'danger', icon: 'alert-triangle', title: 'admin.modulesNotRunning' } as const;
  }
  if (restart.done) {
    return { tone: 'success', icon: 'circle-check', title: 'admin.modulesRestarted' } as const;
  }
  return { tone: 'neutral', icon: 'refresh', title: null } as const;
}

/** The sidecar's state and the one action that answers it. Only for a module
 * that has a process to restart: a library module ships no binary. */
export function RestartCallout({
  module,
  restart,
}: Readonly<{ module: AdminModule; restart: ModuleRestart }>) {
  const t = useT();
  const state = restartState(module, restart);
  return (
    <Callout.Root tone={state.tone} icon={state.icon} size="sm">
      {state.title && <Callout.Title>{t(state.title)}</Callout.Title>}
      <Callout.Detail>{restart.error ?? t('admin.modulesRestartHint')}</Callout.Detail>
      <Callout.Actions>
        <Button
          variant="outline"
          size="sm"
          label={restart.busy ? t('admin.modulesRestarting') : t('admin.modulesRestart')}
          loading={restart.busy}
          onPress={() => void restart.restart()}
        />
      </Callout.Actions>
    </Callout.Root>
  );
}

export function OpProgress({ op }: Readonly<{ op: OpModule }>) {
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
