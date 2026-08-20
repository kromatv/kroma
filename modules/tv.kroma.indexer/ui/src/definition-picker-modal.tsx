import { apiErrorText, useT } from '@kroma/module-sdk';
import { Badge, Button, Dialog, Field, ListRow, Row, Text } from '@kroma/ui/kit';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { createCallable } from 'react-call';
import { useIndexerApi } from './api';
import type { IndexerDefinitionView } from './schemas';

const DEFINITION_PANE: CSSProperties = { maxHeight: '46vh', overflowY: 'auto' };

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
    <Dialog.Root open title={t('indexers.pickTitle')} onClose={() => call.end(null)} width="lg">
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

      <Dialog.Footer>
        <Dialog.Actions onCancel={() => call.end(null)} cancelLabel={t('common.close')} />
      </Dialog.Footer>
    </Dialog.Root>
  );
});
