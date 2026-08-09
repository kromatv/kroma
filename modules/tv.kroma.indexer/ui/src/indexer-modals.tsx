// Add / edit modals for indexers. Two kinds coexist:
//  - Torznab (Jackett / Prowlarr endpoint): name + URL + API key.
//  - Built-in (native Cardigann definition): a browse/pick step then a form
//    generated from the definition's own settings schema.

import { apiErrorText, useAsyncAction, useT } from '@kroma/module-sdk';
import { Button, Dialog, DialogActions, Field, Select, Switch } from '@kroma/ui/kit';
import { useEffect, useMemo, useState } from 'react';
import { createCallable } from 'react-call';
import { useIndexerApi } from './api';
import type {
  IndexerDefinitionDetailView,
  IndexerDefinitionView,
  IndexerView,
  SaveIndexerBody,
} from './schemas';

/** Parse a comma-separated Newznab category list into positive category ids. */
export function parseCats(text: string): number[] {
  return text
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Router for EDITING an existing indexer: a built-in row edits in the settings
 * form, a Torznab row in the endpoint form. Creation goes through the generic
 * add-picker (Torznab) or the definition picker (built-in), not this modal.
 * Resolves `true` once a save/delete succeeds so the caller can refresh. */
export const IndexerModal = createCallable<{ indexer: IndexerView }, boolean>(
  ({ call, indexer }) => {
    if (indexer.kind === 'builtin' && indexer.definitionId) {
      return (
        <BuiltinIndexerForm definitionId={indexer.definitionId} indexer={indexer} end={call.end} />
      );
    }
    return <TorznabIndexerForm indexer={indexer} end={call.end} />;
  },
);

function TorznabIndexerForm({
  indexer,
  end,
}: Readonly<{
  indexer: IndexerView;
  end: (saved: boolean) => void;
}>) {
  const t = useT();
  const indexerApi = useIndexerApi();
  const { busy, error, run } = useAsyncAction();
  const [name, setName] = useState(indexer.name);
  const [url, setUrl] = useState(indexer.url);
  const [apiKey, setApiKey] = useState('');
  const [cats, setCats] = useState(indexer.categories.join(', '));
  const [priority, setPriority] = useState(String(indexer.priority));

  const save = () =>
    run(
      async () => {
        const body: SaveIndexerBody = {
          name: name.trim() || null,
          url: url.trim() || null,
          apiKey: apiKey.trim() || null,
          categories: parseCats(cats),
          enabled: null,
          priority: Number.parseInt(priority, 10) || 0,
        };
        await indexerApi.update(indexer.id, body);
        end(true);
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  const remove = () =>
    run(
      async () => {
        await indexerApi.remove(indexer.id);
        end(true);
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Dialog open title={t('indexers.edit')} onClose={() => end(false)} width={520}>
      <Field
        label={t('indexers.name')}
        value={name}
        onChange={setName}
        placeholder="Jackett - YGG"
      />
      <Field
        label={t('indexers.url')}
        hint={t('indexers.urlHint')}
        value={url}
        onChange={setUrl}
        placeholder="http://nas:9117/api/v2.0/indexers/xxx/results/torznab"
      />
      <Field
        label={t('indexers.apiKey')}
        hint={indexer.hasApiKey ? t('indexers.apiKeyKept') : undefined}
        value={apiKey}
        onChange={setApiKey}
        type="password"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t('indexers.categories')}
          hint={t('indexers.categoriesHint')}
          value={cats}
          onChange={setCats}
        />
        <Field
          label={t('indexers.priority')}
          hint={t('indexers.priorityHint')}
          value={priority}
          onChange={setPriority}
        />
      </div>
      {error ? <p className="text-[13px] font-semibold text-[#EF8091]">{error}</p> : null}
      <DialogActions
        onCancel={() => end(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={save}
        confirmLabel={busy ? t('common.saving') : t('common.save')}
        busy={busy}
        disabled={!name.trim() || !url.trim()}
        destructive={{ label: t('indexers.delete'), onPress: remove, disabled: busy }}
      />
    </Dialog>
  );
}

/** Browse the Cardigann catalog, sync it from upstream, and pick a definition
 * to add. Resolves the picked definition id, or `null` on dismiss. */
export const DefinitionPickerModal = createCallable<void, string | null>(({ call }) => {
  const t = useT();
  const indexerApi = useIndexerApi();
  const [defs, setDefs] = useState<IndexerDefinitionView[] | null>(null);
  const [synced, setSynced] = useState(true);
  const [q, setQ] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    indexerApi
      .definitions()
      .then((v) => {
        setDefs(v.definitions);
        setSynced(v.synced);
      })
      .catch((e) => setError(apiErrorText(e, t('indexers.testFailed'))));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on open
  useEffect(load, []);

  const sync = () => {
    setSyncing(true);
    setError(null);
    indexerApi
      .syncDefinitions()
      .then(() => load())
      .catch((e) => setError(apiErrorText(e, t('indexers.syncFailed'))))
      .finally(() => setSyncing(false));
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = defs ?? [];
    if (!needle) return list.slice(0, 200);
    return list
      .filter(
        (d) =>
          d.name.toLowerCase().includes(needle) || d.description.toLowerCase().includes(needle),
      )
      .slice(0, 200);
  }, [defs, q]);

  return (
    <Dialog open title={t('indexers.pickTitle')} onClose={() => call.end(null)} width={520}>
      <div className="flex items-center gap-2">
        <Field
          label={t('indexers.searchDefs')}
          hideLabel
          icon="search"
          flex
          value={q}
          onChange={setQ}
          placeholder={t('indexers.searchDefs')}
        />
        <Button
          variant="glass"
          size="sm"
          label={t('indexers.syncDefs')}
          onPress={sync}
          loading={syncing}
        />
      </div>

      {error ? <p className="text-[13px] font-semibold text-[#EF8091]">{error}</p> : null}

      {defs && !synced && defs.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-dim">{t('indexers.syncFirst')}</p>
      ) : null}

      <div className="max-h-[46vh] overflow-y-auto">
        {(defs === null ? [] : filtered).map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => call.end(d.id)}
            className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-1 py-2.5 text-left hover:bg-white/3"
          >
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-bold text-text">{d.name}</div>
              <div className="truncate text-[12px] text-dim">{d.description || d.id}</div>
            </div>
            <span className="shrink-0 rounded-full border border-white/12 px-2 py-0.5 text-[11px] font-semibold text-white/55">
              {d.kind === 'public' ? t('indexers.public') : t('indexers.private')}
            </span>
          </button>
        ))}
        {defs === null ? (
          <p className="py-8 text-center text-[13px] text-dim">{t('indexers.loading')}</p>
        ) : null}
      </div>

      <DialogActions
        onCancel={() => call.end(null)}
        cancelLabel={t('common.cancel')}
        onConfirm={() => call.end(null)}
        confirmLabel={t('common.close')}
      />
    </Dialog>
  );
});

/** Create or edit a built-in (Cardigann) indexer from its definition schema.
 * Resolves `true` once a save/delete succeeds so the caller can refresh. */
export const BuiltinIndexerModal = createCallable<
  { definitionId: string; indexer: IndexerView | null },
  boolean
>(({ call, definitionId, indexer }) => (
  <BuiltinIndexerForm definitionId={definitionId} indexer={indexer} end={call.end} />
));

function BuiltinIndexerForm({
  definitionId,
  indexer,
  end,
}: Readonly<{
  definitionId: string;
  indexer: IndexerView | null;
  end: (saved: boolean) => void;
}>) {
  const t = useT();
  const indexerApi = useIndexerApi();
  const { busy, error, run } = useAsyncAction();
  const [detail, setDetail] = useState<IndexerDefinitionDetailView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [baseUrl, setBaseUrl] = useState(indexer?.url ?? '');
  const [cats, setCats] = useState((indexer?.categories ?? [2000, 5000]).join(', '));
  const [priority, setPriority] = useState(String(indexer?.priority ?? 0));

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per definition id
  useEffect(() => {
    indexerApi
      .definition(definitionId)
      .then((d) => {
        setDetail(d);
        // Seed the form from the definition defaults (secrets stay blank; on
        // edit the server keeps stored secrets when a field is left empty).
        const seed: Record<string, string> = {};
        for (const s of d.settings) {
          if (s.kind.startsWith('info')) continue;
          seed[s.name] = s.default ?? (s.kind === 'checkbox' ? 'false' : '');
        }
        setSettings(seed);
        if (!indexer) setBaseUrl(d.links[0] ?? '');
      })
      .catch((e) => setLoadError(apiErrorText(e, t('indexers.testFailed'))));
  }, [definitionId]);

  const setField = (name: string, value: string) => setSettings((s) => ({ ...s, [name]: value }));

  const save = () =>
    run(
      async () => {
        const body: SaveIndexerBody = {
          name: detail?.name ?? null,
          url: baseUrl.trim() || null,
          apiKey: null,
          categories: parseCats(cats),
          enabled: null,
          priority: Number.parseInt(priority, 10) || 0,
          kind: 'builtin',
          definitionId,
          settings,
        };
        if (indexer) await indexerApi.update(indexer.id, body);
        else await indexerApi.create(body);
        end(true);
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  const remove = () =>
    run(
      async () => {
        if (!indexer) return;
        await indexerApi.remove(indexer.id);
        end(true);
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  const title = detail?.name ?? definitionId;

  return (
    <Dialog open title={title} onClose={() => end(false)} width={520}>
      {loadError ? <p className="text-[13px] font-semibold text-[#EF8091]">{loadError}</p> : null}
      {detail === null && !loadError ? (
        <p className="py-8 text-center text-[13px] text-dim">{t('indexers.loading')}</p>
      ) : null}

      {detail ? (
        <div className="max-h-[52vh] overflow-y-auto pr-0.5">
          {detail.links.length > 1 ? (
            <Field label={t('indexers.baseUrl')} mb={16}>
              <Select
                label={t('indexers.baseUrl')}
                value={baseUrl}
                onChange={setBaseUrl}
                options={detail.links.map((l) => ({ value: l, label: l }))}
              />
            </Field>
          ) : (
            <Field label={t('indexers.baseUrl')} value={baseUrl} onChange={setBaseUrl} mb={16} />
          )}

          {detail.settings
            .filter((s) => !s.kind.startsWith('info'))
            .map((s) => {
              const configured = indexer?.configuredSettings.includes(s.name);
              if (s.kind === 'checkbox') {
                return (
                  <div key={s.name} className="mb-4 flex items-center justify-between gap-4">
                    <span className="text-[13.5px] font-semibold text-text">{s.label}</span>
                    <Switch
                      checked={settings[s.name] === 'true'}
                      onChange={(v) => setField(s.name, v ? 'true' : 'false')}
                      label={s.label}
                    />
                  </div>
                );
              }
              if (s.kind === 'select') {
                return (
                  <Field key={s.name} label={s.label} mb={16}>
                    <Select
                      label={s.label}
                      value={settings[s.name] ?? ''}
                      onChange={(v) => setField(s.name, v)}
                      options={s.options.map(([value, label]) => ({ value, label }))}
                    />
                  </Field>
                );
              }
              const isSecret = s.kind === 'password';
              return (
                <Field
                  key={s.name}
                  label={s.label}
                  hint={isSecret && configured ? t('indexers.apiKeyKept') : undefined}
                  value={settings[s.name] ?? ''}
                  onChange={(v) => setField(s.name, v)}
                  type={isSecret ? 'password' : undefined}
                  mb={16}
                />
              );
            })}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={t('indexers.categories')}
              hint={t('indexers.categoriesHint')}
              value={cats}
              onChange={setCats}
            />
            <Field
              label={t('indexers.priority')}
              hint={t('indexers.priorityHint')}
              value={priority}
              onChange={setPriority}
            />
          </div>
        </div>
      ) : null}

      {error ? <p className="text-[13px] font-semibold text-[#EF8091]">{error}</p> : null}
      <DialogActions
        onCancel={() => end(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={save}
        confirmLabel={busy ? t('common.saving') : t('common.save')}
        busy={busy}
        disabled={!detail || !baseUrl.trim()}
        destructive={
          indexer ? { label: t('indexers.delete'), onPress: remove, disabled: busy } : undefined
        }
      />
    </Dialog>
  );
}
