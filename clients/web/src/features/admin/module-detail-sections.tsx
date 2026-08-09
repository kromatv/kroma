// The detail drawer's presentational sections: labels, the meta grid, the
// dependency/capability chips for catalog-only entries, the add-on list and
// the module's declared settings. The container and its actions live in
// module-detail.tsx.

import type { StoreCatalog, StoreModule } from '@kroma/core';
import { moduleIconUrl } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Progress } from '@kroma/ui/kit';
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
    <div className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
      {children}
    </div>
  );
}

export function Meta({ rows }: Readonly<{ rows: [string, ReactNode][] }>) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-dim">{k}</div>
          <div className="mt-0.5 break-words text-[13px] font-semibold text-text">{v}</div>
        </div>
      ))}
    </div>
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
    <div>
      <Label>{t('admin.modulesDependsOn')}</Label>
      <div className="flex flex-wrap gap-1.5">
        {deps.map((d) => (
          <DepChip
            key={d.id}
            label={d.version ? `${d.id}@${d.version}` : d.id}
            state={depState(byId.get(d.id), d.optional)}
          />
        ))}
      </div>
    </div>
  );
}

// What a catalog-only entry provides / needs provided, as neutral chips; the
// install dialog does the real satisfaction math.
function CapabilityChips({ entry }: Readonly<{ entry: StoreModule }>) {
  const t = useT();
  if (entry.provides.length === 0 && entry.requires.length === 0) return null;
  const chip = 'rounded bg-white/5 px-2 py-0.5 text-[11px] text-muted';
  return (
    <div className="flex flex-col gap-3">
      {entry.provides.length > 0 && (
        <div>
          <Label>{t('admin.modulesProvides')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {entry.provides.map((c) => (
              <span key={`${c.kind}:${c.id}`} className={chip}>
                {c.kind}:{c.id}
              </span>
            ))}
          </div>
        </div>
      )}
      {entry.requires.length > 0 && (
        <div>
          <Label>{t('admin.modulesRequires')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {entry.requires.map((r) => (
              <span key={`${r.kind}:${r.id ?? ''}`} className={chip}>
                {r.id ? `${r.kind}:${r.id}` : r.kind}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
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
    <div>
      <Label>{t('admin.modulesAddons')}</Label>
      <div className="flex flex-wrap gap-1.5">
        {addons.map((m) => (
          <span
            key={m.id}
            className={`rounded bg-white/5 px-2 py-0.5 text-[11px] ${m.installedVersion ? 'text-success' : 'text-muted'}`}
          >
            {m.name}
            {m.installedVersion
              ? ` (${t('admin.modulesInstalled').toLowerCase()})`
              : ` · v${m.version}`}
          </span>
        ))}
      </div>
    </div>
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
    <div>
      <Label>{t('admin.modulesSettings')}</Label>
      {host &&
        panels.map((p) => {
          const Panel = p.component;
          return (
            <div key={p.id} className="mb-3">
              <Panel host={host} />
            </div>
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
    </div>
  );
}

export function HeaderIcon({
  id,
  installed,
  icon,
}: Readonly<{ id: string; installed: boolean; icon: string | null | undefined }>) {
  if (installed) {
    return (
      <Image
        src={moduleIconUrl(id, apiBase())}
        fit="cover"
        className="h-14 w-14 shrink-0 rounded-2xl"
      />
    );
  }
  if (icon) {
    return <Image src={icon} fit="cover" className="h-14 w-14 shrink-0 rounded-2xl" />;
  }
  return <div className="h-14 w-14 shrink-0 rounded-2xl bg-white/5" />;
}

export function FooterProgress({ op }: Readonly<{ op: OpModule }>) {
  const t = useT();
  const pct = opPct(op);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-dim">
        <span>{t(PHASE_KEY[op.phase])}</span>
        {pct !== null && <span>{pct}%</span>}
      </div>
      <Progress
        value={runningPct(op.phase, pct) / 100}
        size={5}
        color={op.phase === 'done' ? 'success' : 'accent'}
        rounded
      />
    </div>
  );
}
