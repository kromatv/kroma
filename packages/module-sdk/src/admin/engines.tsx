// Data-driven engine add-flows for the admin console. `GET /api/modules`
// reports each module's enabled flag and the capabilities it provides; each
// capability carries an add-form schema (`fields`) or a custom `flow` (e.g.
// the Cardigann definition picker). A host page lists one add-flow per
// enabled engine and awaits `addEngine(...)`, so adding an engine needs no
// frontend change. One <AddEngineHost/> is mounted by the shell, the same
// shape as the kit's `toast()`/`confirm()`.

import {
  apiErrorText,
  type EngineCapability,
  type EngineField,
  type MessageKey,
  type ModuleInfo,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Dialog, Field, SegmentedControl, Select, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useAdminHost } from './context';
import { useAsyncAction } from './hooks';

function hasAddFlow(cap: EngineCapability): boolean {
  return cap.flow != null || (cap.fields?.length ?? 0) > 0;
}

// Keyed on `['modules']` so this reuses the module host's existing
// `GET /api/modules` query instead of opening a second cache entry; the
// host's enable/disable invalidation keeps it live.
function useModules(): ModuleInfo[] {
  const { client } = useAdminHost();
  const { data } = useQuery({
    queryKey: ['modules'],
    queryFn: () => client.modules(),
    staleTime: 30_000,
  });
  return data ?? [];
}

/** The enabled engines that provide `kind` and expose an add-flow. A disabled
 * module contributes nothing, so its add-flow disappears from the page. */
export function useEnabledEngines(kind: string): EngineCapability[] {
  const modules = useModules();
  return useMemo(
    () =>
      modules
        .filter((m) => m.enabled !== false)
        .flatMap((m) => (m.provides ?? []).filter((c) => c.kind === kind && hasAddFlow(c))),
    [modules, kind],
  );
}

/** Whether each module is enabled, as a predicate. For a caller checking a
 * VARIABLE number of modules, where one `useModuleEnabled` per id would be a
 * hook in a loop. Unknown ids answer true, matching {@link useModuleEnabled}. */
export function useModuleEnabledCheck(): (id: string) => boolean {
  const modules = useModules();
  return useMemo(() => {
    const off = new Set(modules.filter((m) => m.enabled === false).map((m) => m.id));
    return (id: string) => !off.has(id);
  }, [modules]);
}

/** Whether module `id` is enabled. Defaults to true while loading / when unknown,
 * so nothing flickers off before the module list resolves. */
export function useModuleEnabled(id: string): boolean {
  const modules = useModules();
  return useMemo(() => {
    const mod = modules.find((m) => m.id === id);
    return mod ? mod.enabled !== false : true;
  }, [modules, id]);
}

/** A controlled form over an engine's declared fields. Every label resolves
 * through `t()`, so a field key like `field.url` localizes while a proper-noun
 * engine label (`Transmission`) passes through unchanged. */
export function FieldForm({
  fields,
  values,
  onChange,
}: Readonly<{
  fields: EngineField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}>) {
  const t = useT();
  return (
    <>
      {fields.map((f) => {
        const label = t(f.label as MessageKey);
        return f.type === 'select' ? (
          <Field.Root key={f.key} label={label}>
            <EngineSelect
              label={label}
              value={values[f.key] ?? ''}
              options={f.options ?? []}
              onChange={(v) => onChange(f.key, v)}
            />
          </Field.Root>
        ) : (
          <Field.Root
            key={f.key}
            label={label}
            value={values[f.key] ?? ''}
            onValueChange={(v) => onChange(f.key, v)}
          >
            <Field.Input
              type={f.secret ? 'password' : 'text'}
              icon={f.secret ? 'lock' : undefined}
              placeholder={f.placeholder}
            />
          </Field.Root>
        );
      })}
    </>
  );
}

/** The console's value-chip select (label === value). Keeps the current value
 * selectable even if it isn't in the list, so a stored setting the schema no
 * longer names still shows instead of falling to the placeholder. */
function EngineSelect({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}>) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select.Root label={label} value={value} onValueChange={onChange}>
      <Select.Trigger block />
      {all.map((o) => (
        <Select.Item key={o} value={o}>
          {o}
        </Select.Item>
      ))}
    </Select.Root>
  );
}

export interface AddEngineOptions {
  engines: EngineCapability[];
  title: string;
  onSubmit: (engineId: string, values: Record<string, string>) => Promise<void>;
}

interface Ask extends AddEngineOptions {
  id: number;
  resolve: (added: boolean) => void;
}

let accept: ((ask: Ask) => void) | null = null;
let nextId = 1;

/** Open the generic "add an engine" dialog: pick an engine, name it, fill its
 * declared fields, submit. Resolves `true` on submit, `false` on dismiss - and
 * immediately `false` when no <AddEngineHost/> is mounted. */
export function addEngine(options: Readonly<AddEngineOptions>): Promise<boolean> {
  const take = accept;
  if (!take) return Promise.resolve(false);
  return new Promise((resolve) => take({ id: nextId++, ...options, resolve }));
}

/** Mount once, near the admin root. Draws whatever `addEngine()` asks. */
export function AddEngineHost() {
  const [queue, setQueue] = useState<Ask[]>([]);
  useEffect(() => {
    accept = (ask) => setQueue((pending) => [...pending, ask]);
    return () => {
      accept = null;
    };
  }, []);
  const current = queue[0];
  if (!current) return null;
  const settle = (added: boolean) => {
    current.resolve(added);
    setQueue((pending) => pending.slice(1));
  };
  return <AddEngineDialog key={current.id} ask={current} onSettle={settle} />;
}

function AddEngineDialog({
  ask,
  onSettle,
}: Readonly<{ ask: Ask; onSettle: (added: boolean) => void }>) {
  const t = useT();
  const { busy, error, run } = useAsyncAction();
  const [engineId, setEngineId] = useState(ask.engines[0]?.id ?? '');
  const [name, setName] = useState('');
  // Keyed by ENGINE: fields typed for Transmission must not ride along in a
  // qBittorrent submit, and switching back must not lose what was typed.
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

  const engine = ask.engines.find((e) => e.id === engineId) ?? ask.engines[0];
  const fields = engine?.fields ?? [];
  const values = drafts[engine?.id ?? ''] ?? {};
  const setField = (key: string, value: string) =>
    setDrafts((all) => {
      const id = engine?.id ?? '';
      return { ...all, [id]: { ...all[id], [key]: value } };
    });

  const missingRequired = fields.some((f) => f.required && !(values[f.key] ?? '').trim());
  const canSubmit = Boolean(engine) && Boolean(name.trim()) && !missingRequired;

  const submit = () =>
    run(
      async () => {
        if (!engine) return;
        await ask.onSubmit(engine.id, { name: name.trim(), ...values });
        onSettle(true);
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Dialog.Root open title={ask.title} width="md" onClose={() => onSettle(false)}>
      {ask.engines.length > 1 ? (
        <SegmentedControl.Root
          value={engineId}
          onValueChange={setEngineId}
          options={ask.engines.map((e) => ({
            value: e.id,
            label: t((e.label ?? e.id) as MessageKey),
          }))}
        />
      ) : null}
      <Box gap={16}>
        <Field.Root label={t('field.name')} value={name} onValueChange={setName}>
          <Field.Input icon="tag" />
        </Field.Root>
        <FieldForm fields={fields} values={values} onChange={setField} />
        {error ? (
          <Text variant="meta" color="danger">
            {error}
          </Text>
        ) : null}
      </Box>
      <Dialog.Actions
        onCancel={() => onSettle(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={submit}
        confirmLabel={busy ? t('common.saving') : t('common.save')}
        busy={busy}
        disabled={!canSubmit}
      />
    </Dialog.Root>
  );
}
