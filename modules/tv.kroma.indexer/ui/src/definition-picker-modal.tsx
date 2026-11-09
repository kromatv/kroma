import { langName } from '@kromatv/core';
import { useFormat, usePoll, useT } from '@kromatv/module-sdk';
import {
  Badge,
  Callout,
  Dialog,
  Field,
  ListRow,
  Row,
  Select,
  Spinner,
  Text,
} from '@kromatv/ui/kit';
import { useEffect, useMemo, useState } from 'react';
import { createCallable } from 'react-call';
import { useIndexerApi } from './api';
import { filterDefinitions, type KindFilter, languagesIn } from './definition-filter';
import type { IndexerDefinitionsView, IndexerDefinitionView } from './schemas';

const WAITING_POLL_MS = 3000;
const SETTLED_POLL_MS = 60 * 60 * 1000;
const NONE: readonly IndexerDefinitionView[] = [];
const KINDS: readonly KindFilter[] = ['all', 'public', 'private'];

/** Browse the Cardigann catalog the module keeps current, and pick a definition
 * to add. `added` names the definitions already configured, which are marked.
 * Resolves the picked definition id, or `null` on dismiss. */
export const DefinitionPickerModal = createCallable<{ added: readonly string[] }, string | null>(
  ({ call, added }) => {
    const t = useT();
    const fmt = useFormat();
    const indexerApi = useIndexerApi();
    const [waiting, setWaiting] = useState(true);
    const { data, failed } = usePoll(
      ['admin', 'indexers', 'definitions'],
      () => indexerApi.definitions(),
      waiting ? WAITING_POLL_MS : SETTLED_POLL_MS,
    );
    useEffect(() => {
      if (data) setWaiting(!data.synced);
    }, [data]);
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState<KindFilter>('all');
    const [language, setLanguage] = useState('all');

    const definitions = data?.definitions ?? NONE;
    const languages = useMemo(() => languagesIn(definitions), [definitions]);
    const shown = useMemo(
      () => filterDefinitions(definitions, { query, kind, language }),
      [definitions, query, kind, language],
    );
    const isAdded = useMemo(() => new Set(added), [added]);
    const filtered = shown.length !== definitions.length;
    const title = t('indexers.pickTitle');
    const close = () => call.end(null);

    return (
      <Dialog.Root open title={title} onClose={close} width="lg" fullHeight>
        <Dialog.Header>
          <Text variant="title" accessibilityRole="header" lines={1}>
            {title}
          </Text>
          <Field.Root
            label={t('indexers.searchDefs')}
            hideLabel
            value={query}
            onValueChange={setQuery}
          >
            <Field.Input icon="search" placeholder={t('indexers.searchDefs')} />
          </Field.Root>
          <Row wrap gap={8}>
            <Select.Root
              value={kind}
              onValueChange={(next) => setKind(KINDS.find((one) => one === next) ?? 'all')}
              label={t('indexers.kindFilter')}
            >
              <Select.Trigger size="sm" />
              <Select.Item value="all" label={t('indexers.allKinds')} />
              <Select.Item value="public" label={t('indexers.publicTrackers')} />
              <Select.Item value="private" label={t('indexers.privateTrackers')} />
            </Select.Root>
            <Select.Root
              value={language}
              onValueChange={setLanguage}
              label={t('indexers.languageFilter')}
            >
              <Select.Trigger size="sm" />
              <Select.Item value="all" label={t('indexers.allLanguages')} />
              {languages.map((code) => (
                <Select.Item key={code} value={code} label={langName(t, code) ?? code} />
              ))}
            </Select.Root>
          </Row>
          {data?.synced ? (
            <Text variant="meta" color="textDim">
              {filtered
                ? t('indexers.matchCount', { count: shown.length, total: definitions.length })
                : t('indexers.trackerCount', { count: definitions.length })}
              {data.syncedAt
                ? ` · ${t('indexers.catalogUpdated', { elapsed: fmt.elapsed(data.syncedAt) })}`
                : ''}
            </Text>
          ) : null}
        </Dialog.Header>

        <Dialog.Panel>
          {data?.failure ? (
            <Callout.Root tone="danger">
              <Callout.Title>{t('indexers.catalogSyncFailed')}</Callout.Title>
              <Callout.Detail>{data.failure}</Callout.Detail>
            </Callout.Root>
          ) : null}
          <PickerBody
            state={bodyState(failed, data)}
            shown={shown}
            isAdded={isAdded}
            onPick={(id) => call.end(id)}
          />
        </Dialog.Panel>

        <Dialog.Footer>
          <Dialog.Actions onCancel={close} cancelLabel={t('common.close')} />
        </Dialog.Footer>
      </Dialog.Root>
    );
  },
);

type BodyState = 'failed' | 'loading' | 'downloading' | 'ready';

function bodyState(failed: boolean, data: IndexerDefinitionsView | null): BodyState {
  if (failed) return 'failed';
  if (!data) return 'loading';
  return data.synced ? 'ready' : 'downloading';
}

function PickerBody({
  state,
  shown,
  isAdded,
  onPick,
}: Readonly<{
  state: BodyState;
  shown: readonly IndexerDefinitionView[];
  isAdded: ReadonlySet<string>;
  onPick: (id: string) => void;
}>) {
  const t = useT();
  if (state === 'failed') return <Note text={t('indexers.catalogUnavailable')} />;
  if (state === 'loading') return <Note text={t('indexers.loading')} />;
  if (state === 'downloading') {
    return (
      <Row gap={12} center py={32}>
        <Spinner size={20} />
        <Text variant="meta" color="textDim">
          {t('indexers.catalogDownloading')}
        </Text>
      </Row>
    );
  }
  if (shown.length === 0) return <Note text={t('indexers.noTrackerMatch')} />;
  return (
    <ListRow.Group size="sm">
      {shown.map((d) => (
        <ListRow.Root key={d.id} size="sm" onPress={() => onPick(d.id)}>
          <ListRow.Label>{d.name}</ListRow.Label>
          <ListRow.Hint>{d.description || d.id}</ListRow.Hint>
          <ListRow.Trailing>
            <Row gap={6}>
              {isAdded.has(d.id) ? (
                <Badge tone="success">{t('indexers.alreadyAdded')}</Badge>
              ) : null}
              <Badge tone="neutral">{t(KIND_LABEL[d.kind] ?? 'indexers.private')}</Badge>
            </Row>
          </ListRow.Trailing>
        </ListRow.Root>
      ))}
    </ListRow.Group>
  );
}

const KIND_LABEL: Readonly<
  Record<string, 'indexers.public' | 'indexers.private' | 'indexers.semiPrivate'>
> = {
  public: 'indexers.public',
  private: 'indexers.private',
  'semi-private': 'indexers.semiPrivate',
};

function Note({ text }: Readonly<{ text: string }>) {
  return (
    <Text variant="meta" color="textDim" textAlign="center" py={32}>
      {text}
    </Text>
  );
}
