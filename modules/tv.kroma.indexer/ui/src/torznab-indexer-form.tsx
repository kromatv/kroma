import { apiErrorText, useAsyncAction, useT } from '@kroma/module-sdk';
import { Button, Dialog, Field, Text } from '@kroma/ui/kit';
import { useState } from 'react';
import { useIndexerApi } from './api';
import { CategoriesAndPriority } from './categories-and-priority';
import { parseCats } from './parse-cats';
import type { IndexerView, SaveIndexerBody } from './schemas';

export function TorznabIndexerForm({
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
    <Dialog.Root open title={t('indexers.edit')} onClose={() => end(false)} width="md">
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
      <CategoriesAndPriority
        cats={cats}
        onCatsChange={setCats}
        priority={priority}
        onPriorityChange={setPriority}
      />
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
