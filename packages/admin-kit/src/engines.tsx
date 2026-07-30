// Data-driven engine add-flows for the admin console. `GET /api/modules`
// reports each module's enabled flag and the capabilities it provides; each
// capability carries an add-form schema (`fields`) or a custom `flow` (e.g.
// the Cardigann definition picker). A host page lists one add-flow per
// enabled engine and renders <AddEngineModal>, so adding an engine needs no
// frontend change.

import {
  apiErrorText,
  type EngineCapability,
  type EngineField,
  type MessageKey,
  type ModuleInfo,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { createCallable } from 'react-call';
import { useAdminKit } from './context';
import { SegmentedControl } from './controls';
import { Field, Modal, ModalActions, Select, TextInput } from './forms';
import { useAsyncAction } from './hooks';

function hasAddFlow(cap: EngineCapability): boolean {
  return cap.flow != null || (cap.fields?.length ?? 0) > 0;
}

// Keyed on `['modules']` so this reuses the module host's existing
// `GET /api/modules` query instead of opening a second cache entry; the
// host's enable/disable invalidation keeps it live.
function useModules(): ModuleInfo[] {
  const { client } = useAdminKit();
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
      {fields.map((f) => (
        <Field key={f.key} label={t(f.label as MessageKey)}>
          {f.type === 'select' ? (
            <Select
              value={values[f.key] ?? ''}
              options={f.options ?? []}
              onChange={(v) => onChange(f.key, v)}
            />
          ) : (
            <TextInput
              value={values[f.key] ?? ''}
              onChange={(v) => onChange(f.key, v)}
              type={f.secret ? 'password' : 'text'}
              placeholder={f.placeholder}
              className="w-full"
            />
          )}
        </Field>
      ))}
    </>
  );
}

/** The generic "add an engine" modal, as an imperative callable: pick an
 * engine, name it, fill its declared fields, submit. `onSubmit` receives the
 * chosen engine id and the collected values (`name` plus every field key);
 * the modal resolves `true` on submit, `false` on dismiss. */
export const AddEngineModal = createCallable<
  {
    engines: EngineCapability[];
    title: string;
    onSubmit: (engineId: string, values: Record<string, string>) => Promise<void>;
  },
  boolean
>(({ call, engines, title, onSubmit }) => {
  const t = useT();
  const { busy, error, run } = useAsyncAction();
  const [engineId, setEngineId] = useState(engines[0]?.id ?? '');
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});

  const engine = engines.find((e) => e.id === engineId) ?? engines[0];
  const fields = engine?.fields ?? [];
  const setField = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const missingRequired = fields.some((f) => f.required && !(values[f.key] ?? '').trim());
  const canSubmit = Boolean(engine) && Boolean(name.trim()) && !missingRequired;

  const submit = () =>
    run(
      async () => {
        if (!engine) return;
        await onSubmit(engine.id, { name: name.trim(), ...values });
        call.end(true);
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Modal title={title} onClose={() => call.end(false)}>
      {engines.length > 1 ? (
        <div className="mb-4">
          <SegmentedControl
            value={engineId}
            onChange={setEngineId}
            options={engines.map((e) => ({
              value: e.id,
              label: t((e.label ?? e.id) as MessageKey),
            }))}
          />
        </div>
      ) : null}
      <Field label={t('field.name')}>
        <TextInput value={name} onChange={setName} className="w-full" />
      </Field>
      <FieldForm fields={fields} values={values} onChange={setField} />
      {error ? <p className="mt-1 text-[13px] font-semibold text-[#EF8091]">{error}</p> : null}
      <ModalActions
        onCancel={() => call.end(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={submit}
        confirmLabel={busy ? t('common.saving') : t('common.save')}
        busy={busy}
        disabled={!canSubmit}
      />
    </Modal>
  );
});
