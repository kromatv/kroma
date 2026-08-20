import { apiErrorText, useAsyncAction, useT } from '@kroma/module-sdk';
import {
  Button,
  Dialog,
  Field,
  Row,
  ringRoomBlock,
  ringRoomInline,
  Select,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { type CSSProperties, useEffect, useState } from 'react';
import { useIndexerApi } from './api';
import { CategoriesAndPriority } from './categories-and-priority';
import { parseCats } from './parse-cats';
import type { IndexerDefinitionDetailView, IndexerView, SaveIndexerBody } from './schemas';

// The fields in it are flush with the pane's edges, and the pane clips.
const SETTINGS_PANE: CSSProperties = {
  ...ringRoomBlock(),
  ...ringRoomInline(),
  maxHeight: '52vh',
  overflowY: 'auto',
};

export function BuiltinIndexerForm({
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
    <Dialog.Root open title={title} onClose={() => end(false)} width="md">
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

          <CategoriesAndPriority
            cats={cats}
            onCatsChange={setCats}
            priority={priority}
            onPriorityChange={setPriority}
          />
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
