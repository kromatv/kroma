// Data-driven engine add-flows for the admin console. `GET /api/modules`
// reports each module's enabled flag and the points it answers; a contribution
// carries an add-form schema (`fields`) or a custom `flow` (e.g. the Cardigann
// definition picker). A host page lists one add-flow per enabled contributor to
// its point and obtains the add function through useAddEngine(). Each admin
// root owns the queue drawn by its AddEngineHost.

import { apiErrorText } from '@kromatv/client';
import type { EngineContribution, EngineField, ModuleInfo } from '@kromatv/client/modules';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Dialog, Field, SegmentGroup, Select, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAdminHost } from './context';
import { useAsyncAction } from './hooks';

/** A contribution the add-picker can offer: it names the instance an added row
 * stores, and it has either a field form or a custom flow. */
export type EngineChoice = EngineContribution & { id: string };

function hasAddFlow(c: EngineContribution): c is EngineChoice {
  return c.id != null && (c.flow != null || (c.fields?.length ?? 0) > 0);
}

// Keyed on `['modules']` so this reuses the module host's existing
// `GET /api/modules` query instead of opening a second cache entry; the
// host's enable/disable invalidation keeps it live.
function useModules(): ModuleInfo[] {
  const { client } = useAdminHost();
  const { data } = useQuery({
    queryKey: ['modules'],
    queryFn: () => client.modules.list(),
    staleTime: 30_000,
  });
  return data ?? [];
}

/** The enabled contributors to `point` that expose an add-flow. A disabled
 * module contributes nothing, so its add-flow disappears from the page. */
export function useEnabledEngines(point: string): EngineChoice[] {
  const modules = useModules();
  return useMemo(
    () =>
      modules
        .filter((m) => m.enabled !== false)
        .flatMap((m) => (m.contributes ?? []).filter((c) => c.point === point))
        .filter(hasAddFlow),
    [modules, point],
  );
}

/** Whether each module is enabled, as a predicate. For a caller checking a
 * VARIABLE number of modules, where one `useModuleEnabled` per id would be a
 * hook in a loop. Unknown ids answer true, matching {@link useModuleEnabled}. */
export function useModuleEnabledCheck(): (id: string) => boolean {
  const modules = useModules();
  return useMemo(() => {
    const off = new Set<string>(modules.filter((m) => m.enabled === false).map((m) => m.id));
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
  engines: EngineChoice[];
  title: string;
  onSubmit: (engineId: string, values: Record<string, string>) => Promise<void>;
}

interface Ask extends AddEngineOptions {
  id: number;
  resolve: (added: boolean) => void;
}

type AddEngine = (options: Readonly<AddEngineOptions>) => Promise<boolean>;
const AddEngineContext = createContext<AddEngine>(() => Promise.resolve(false));

/** Request a form from this admin root; fail closed without a host. */
export function useAddEngine(): AddEngine {
  return useContext(AddEngineContext);
}

/** Wrap the admin root whose engine-add requests this host draws. */
export function AddEngineHost({ children }: Readonly<{ children?: ReactNode }>) {
  const [queue, setQueue] = useState<Ask[]>([]);
  const nextId = useRef(1);
  const pending = useRef(new Set<(answer: boolean) => void>());
  const addEngine = useCallback<AddEngine>(
    (options) =>
      new Promise((resolve) => {
        pending.current.add(resolve);
        const ask = { id: nextId.current++, ...options, resolve };
        setQueue((queue) => [...queue, ask]);
      }),
    [],
  );
  useEffect(() => {
    const requests = pending.current;
    return () => {
      for (const resolve of requests) resolve(false);
      requests.clear();
    };
  }, []);
  const current = queue[0];
  const settle = (added: boolean) => {
    if (!current) return;
    pending.current.delete(current.resolve);
    current.resolve(added);
    setQueue((queue) => queue.slice(1));
  };
  return (
    <AddEngineContext.Provider value={addEngine}>
      {children}
      {current ? <AddEngineDialog key={current.id} ask={current} onSettle={settle} /> : null}
    </AddEngineContext.Provider>
  );
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
        <SegmentGroup.Root value={engineId} onValueChange={setEngineId}>
          {ask.engines.map((e) => (
            <SegmentGroup.Item key={e.id} value={e.id}>
              <SegmentGroup.Label>{t((e.label ?? e.id) as MessageKey)}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
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
