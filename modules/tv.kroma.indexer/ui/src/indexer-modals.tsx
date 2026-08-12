// Add / edit modals for indexers. Two kinds coexist:
//  - Torznab (Jackett / Prowlarr endpoint): name + URL + API key.
//  - Built-in (native Cardigann definition): a browse/pick step then a form
//    generated from the definition's own settings schema.

import { apiErrorText, useAsyncAction, useT } from '@kroma/module-sdk';
import {
  Badge,
  Box,
  Button,
  Dialog,
  Field,
  ListRow,
  Row,
  Select,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { createCallable } from 'react-call';
import { useIndexerApi } from './api';
import type {
  IndexerDefinitionDetailView,
  IndexerDefinitionView,
  IndexerView,
  SaveIndexerBody,
} from './schemas';

const DEFINITION_PANE: CSSProperties = { maxHeight: '46vh', overflowY: 'auto' };

const SETTINGS_PANE: CSSProperties = { maxHeight: '52vh', overflowY: 'auto', paddingRight: 2 };

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
    <Dialog.Root open title={t('indexers.edit')} onClose={() => end(false)} width={520}>
      <Field.Root label={t('indexers.name')} value={name} onValueChange={setName}>
        <Field.Input placeholder="Jackett - YGG" />
      </Field.Root>
      <Field.Root label={t('indexers.url')} value={url} onValueChange={setUrl}>
        <Field.Input placeholder="http://nas:9117/api/v2.0/indexers/xxx/results/torznab" />
        <Field.Hint>{t('indexers.urlHint')}</Field.Hint>
      </Field.Root>
      <Field.Root label={t('indexers.apiKey')} value={apiKey} onValueChange={setApiKey}>
        <Field.Input type="password" />
        {indexer.hasApiKey ? <Field.Hint>{t('indexers.apiKeyKept')}</Field.Hint> : null}
      </Field.Root>
      <Box row={{ base: false, md: true }} gap={16}>
        <Field.Root flex label={t('indexers.categories')} value={cats} onValueChange={setCats}>
          <Field.Hint>{t('indexers.categoriesHint')}</Field.Hint>
        </Field.Root>
        <Field.Root
          flex
          label={t('indexers.priority')}
          value={priority}
          onValueChange={setPriority}
        >
          <Field.Hint>{t('indexers.priorityHint')}</Field.Hint>
        </Field.Root>
      </Box>
      {error ? (
        <Text variant="meta" color="dangerHover">
          {error}
        </Text>
      ) : null}
      <Dialog.Actions
        onCancel={() => end(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={save}
        confirmLabel={busy ? t('common.saving') : t('common.save')}
        busy={busy}
        disabled={!name.trim() || !url.trim()}
      >
        <Button
          variant="dangerGhost"
          size="sm"
          label={t('indexers.delete')}
          onPress={remove}
          disabled={busy}
        />
      </Dialog.Actions>
    </Dialog.Root>
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
    <Dialog.Root open title={t('indexers.pickTitle')} onClose={() => call.end(null)} width={520}>
      <Row gap={8}>
        <Field.Root label={t('indexers.searchDefs')} hideLabel flex value={q} onValueChange={setQ}>
          <Field.Input icon="search" placeholder={t('indexers.searchDefs')} />
        </Field.Root>
        <Button
          variant="glass"
          size="sm"
          label={t('indexers.syncDefs')}
          onPress={sync}
          loading={syncing}
        />
      </Row>

      {error ? (
        <Text variant="meta" color="dangerHover">
          {error}
        </Text>
      ) : null}

      {defs && !synced && defs.length === 0 ? (
        <Text variant="meta" color="textDim" textAlign="center" py={32}>
          {t('indexers.syncFirst')}
        </Text>
      ) : null}

      <div style={DEFINITION_PANE}>
        {defs !== null && filtered.length > 0 ? (
          <ListRow.Group size="sm">
            {filtered.map((d) => (
              <ListRow.Root key={d.id} size="sm" onPress={() => call.end(d.id)}>
                <ListRow.Label>{d.name}</ListRow.Label>
                <ListRow.Hint>{d.description || d.id}</ListRow.Hint>
                <ListRow.Trailing>
                  <Badge tone="neutral">
                    {d.kind === 'public' ? t('indexers.public') : t('indexers.private')}
                  </Badge>
                </ListRow.Trailing>
              </ListRow.Root>
            ))}
          </ListRow.Group>
        ) : null}
        {defs === null ? (
          <Text variant="meta" color="textDim" textAlign="center" py={32}>
            {t('indexers.loading')}
          </Text>
        ) : null}
      </div>

      <Dialog.Actions
        onCancel={() => call.end(null)}
        cancelLabel={t('common.cancel')}
        onConfirm={() => call.end(null)}
        confirmLabel={t('common.close')}
      />
    </Dialog.Root>
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
    <Dialog.Root open title={title} onClose={() => end(false)} width={520}>
      {loadError ? (
        <Text variant="meta" color="dangerHover">
          {loadError}
        </Text>
      ) : null}
      {detail === null && !loadError ? (
        <Text variant="meta" color="textDim" textAlign="center" py={32}>
          {t('indexers.loading')}
        </Text>
      ) : null}

      {detail ? (
        <div style={SETTINGS_PANE}>
          {detail.links.length > 1 ? (
            <Field.Root label={t('indexers.baseUrl')} mb={16}>
              <Select.Root label={t('indexers.baseUrl')} value={baseUrl} onValueChange={setBaseUrl}>
                <Select.Trigger />
                {detail.links.map((l) => (
                  <Select.Item key={l} value={l}>
                    {l}
                  </Select.Item>
                ))}
              </Select.Root>
            </Field.Root>
          ) : (
            <Field.Root
              label={t('indexers.baseUrl')}
              value={baseUrl}
              onValueChange={setBaseUrl}
              mb={16}
            />
          )}

          {detail.settings
            .filter((s) => !s.kind.startsWith('info'))
            .map((s) => {
              const configured = indexer?.configuredSettings.includes(s.name);
              if (s.kind === 'checkbox') {
                return (
                  <Row key={s.name} between gap={16} mb={16}>
                    <Text variant="label" shrink={1} minW={0}>
                      {s.label}
                    </Text>
                    <Switch
                      checked={settings[s.name] === 'true'}
                      onCheckedChange={(v) => setField(s.name, v ? 'true' : 'false')}
                      label={s.label}
                    />
                  </Row>
                );
              }
              if (s.kind === 'select') {
                return (
                  <Field.Root key={s.name} label={s.label} mb={16}>
                    <Select.Root
                      label={s.label}
                      value={settings[s.name] ?? ''}
                      onValueChange={(v) => setField(s.name, v)}
                    >
                      <Select.Trigger />
                      {s.options.map(([value, label]) => (
                        <Select.Item key={value} value={value}>
                          {label}
                        </Select.Item>
                      ))}
                    </Select.Root>
                  </Field.Root>
                );
              }
              const isSecret = s.kind === 'password';
              return (
                <Field.Root
                  key={s.name}
                  label={s.label}
                  value={settings[s.name] ?? ''}
                  onValueChange={(v) => setField(s.name, v)}
                  mb={16}
                >
                  <Field.Input type={isSecret ? 'password' : undefined} />
                  {isSecret && configured ? (
                    <Field.Hint>{t('indexers.apiKeyKept')}</Field.Hint>
                  ) : null}
                </Field.Root>
              );
            })}

          <Box row={{ base: false, md: true }} gap={16}>
            <Field.Root flex label={t('indexers.categories')} value={cats} onValueChange={setCats}>
              <Field.Hint>{t('indexers.categoriesHint')}</Field.Hint>
            </Field.Root>
            <Field.Root
              flex
              label={t('indexers.priority')}
              value={priority}
              onValueChange={setPriority}
            >
              <Field.Hint>{t('indexers.priorityHint')}</Field.Hint>
            </Field.Root>
          </Box>
        </div>
      ) : null}

      {error ? (
        <Text variant="meta" color="dangerHover">
          {error}
        </Text>
      ) : null}
      <Dialog.Actions
        onCancel={() => end(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={save}
        confirmLabel={busy ? t('common.saving') : t('common.save')}
        busy={busy}
        disabled={!detail || !baseUrl.trim()}
      >
        {indexer ? (
          <Button
            variant="dangerGhost"
            size="sm"
            label={t('indexers.delete')}
            onPress={remove}
            disabled={busy}
          />
        ) : null}
      </Dialog.Actions>
    </Dialog.Root>
  );
}
