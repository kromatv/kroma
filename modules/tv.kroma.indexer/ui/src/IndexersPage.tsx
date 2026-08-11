// Admin "Indexeurs" page: the configured Torznab endpoints (Jackett /
// Prowlarr) as a card grid with enable toggles, live test (t=caps latency +
// TMDB id support) and an add/edit modal. Structure mirrors the libraries page.

import {
  addEngine,
  apiErrorText,
  Denied,
  type EngineCapability,
  type MessageKey,
  ModuleFailed,
  ModuleLoading,
  useCap,
  useEnabledEngines,
  usePoll,
  useT,
} from '@kroma/module-sdk';
import {
  Badge,
  Box,
  Button,
  Divider,
  EmptyState,
  Grid,
  Icon,
  IconButton,
  PageHeader,
  Row,
  Surface,
  Switch,
  TableSkeleton,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { useIndexerApi } from './api';
import {
  BuiltinIndexerModal,
  DefinitionPickerModal,
  IndexerModal,
  parseCats,
} from './indexer-modals';
import type { IndexerTestResult, IndexerView } from './schemas';

type TestState = { busy?: boolean; result?: IndexerTestResult; error?: string };

export default function IndexersPage() {
  const t = useT();
  const indexerApi = useIndexerApi();
  const canManage = useCap('settings.manage');
  const engines = useEnabledEngines('indexer-engine');
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const { data, failed, reload } = usePoll(['admin', 'indexers'], () => indexerApi.list(), 30000);

  if (!canManage) return <Denied />;
  // Before the first answer there is no list to be empty: an empty state here
  // would read as "you have no indexers", which is a claim we cannot make yet.
  if (!data) return failed ? <ModuleFailed retry={reload} /> : <ModuleLoading />;
  const indexers = data.indexers;

  const toggle = (ix: IndexerView, enabled: boolean) => {
    indexerApi
      .update(ix.id, {
        name: null,
        url: null,
        apiKey: null,
        categories: null,
        enabled,
        priority: null,
      })
      .then(reload)
      .catch(() => reload());
  };

  const test = (ix: IndexerView) => {
    setTests((s) => ({ ...s, [ix.id]: { busy: true } }));
    indexerApi
      .test(ix.id)
      .then((result) => setTests((s) => ({ ...s, [ix.id]: { result } })))
      .catch((e) =>
        setTests((s) => ({ ...s, [ix.id]: { error: apiErrorText(e, t('indexers.testFailed')) } })),
      )
      .finally(reload);
  };

  const openEdit = async (ix: IndexerView) => {
    if (await IndexerModal.call({ indexer: ix })) reload();
  };

  // Built-in flow: browse/pick a Cardigann definition, then fill its settings.
  const openPicker = async () => {
    const definitionId = await DefinitionPickerModal.call();
    if (!definitionId) return;
    if (await BuiltinIndexerModal.call({ definitionId, indexer: null })) reload();
  };

  // Generic engine (e.g. Torznab): the shared field form over the engine's schema.
  const openAddEngine = async (engine: EngineCapability) => {
    const changed = await addEngine({
      engines: [engine],
      title: t('indexers.addTitle'),
      onSubmit: (kind, v) =>
        indexerApi
          .create({
            kind,
            name: v.name ?? null,
            url: v.url ?? null,
            apiKey: v.apiKey ?? null,
            categories: v.categories ? parseCats(v.categories) : null,
            enabled: true,
            priority: null,
            definitionId: null,
          })
          .then(() => {}),
    });
    if (changed) reload();
  };

  // One add-flow per enabled engine: the native Cardigann engine opens its
  // definition picker (flow "definition"); every other engine (e.g. Torznab)
  // opens the generic field form. No engines -> no add buttons.
  const addButtons =
    engines.length > 0 ? (
      <Row gap={8}>
        {engines.map((engine) => (
          <Button
            key={engine.id}
            variant="primary"
            icon="plus"
            label={t((engine.label ?? engine.id) as MessageKey)}
            onPress={() =>
              engine.flow === 'definition' ? void openPicker() : void openAddEngine(engine)
            }
          />
        ))}
      </Row>
    ) : null;

  return (
    <>
      <PageHeader.Root
        title={t('admin.indexersTitle')}
        subtitle={t('admin.indexersSub')}
        actions={addButtons ?? undefined}
      />

      {data === null ? <TableSkeleton rows={5} /> : null}

      {indexers.length === 0 && data ? (
        <EmptyState.Root
          icon="antenna"
          title={t('indexers.emptyTitle')}
          hint={engines.length === 0 ? t('indexers.noEngines') : t('indexers.emptyBody')}
          actions={addButtons ?? undefined}
        />
      ) : null}

      <Box mt={24}>
        <Grid min={448} gap={16}>
          {indexers.map((ix) => (
            <IndexerCard
              key={ix.id}
              ix={ix}
              test={tests[ix.id]}
              onToggle={(v) => toggle(ix, v)}
              onTest={() => test(ix)}
              onEdit={() => void openEdit(ix)}
            />
          ))}
        </Grid>
      </Box>

      <IndexerModal />
      <DefinitionPickerModal />
      <BuiltinIndexerModal />
    </>
  );
}

function IndexerCard({
  ix,
  test,
  onToggle,
  onTest,
  onEdit,
}: Readonly<{
  ix: IndexerView;
  test?: TestState;
  onToggle: (v: boolean) => void;
  onTest: () => void;
  onEdit: () => void;
}>) {
  const t = useT();
  return (
    <Surface elevated border="border">
      <Box row align="flex-start" between gap={16}>
        <Row shrink={1} minW={0} gap={14}>
          <Row center w={44} h={44} shrink={0} radius="lg" border="borderStrong" bg="surface2">
            <Icon name="antenna" size={20} stroke={1.8} color="accent" />
          </Row>
          <Box shrink={1} minW={0}>
            <Row gap={10}>
              <Text variant="cardTitle" lines={1} shrink={1} minW={0}>
                {ix.name}
              </Text>
              {!ix.enabled ? <Badge tone="neutral">{t('indexers.disabled')}</Badge> : null}
            </Row>
            <Text variant="meta" color="textDim" lines={1} mt={2}>
              {ix.url}
            </Text>
          </Box>
        </Row>
        <Switch checked={ix.enabled} onChange={onToggle} label={ix.name} />
      </Box>

      <Row wrap gap={8} mt={14}>
        <Badge tone={ix.kind === 'builtin' ? 'warning' : 'info'}>
          {ix.kind === 'builtin' ? t('indexers.builtin') : t('indexers.torznab')}
        </Badge>
        <Badge tone="info">{t('indexers.cats', { cats: ix.categories.join(', ') })}</Badge>
        {ix.priority !== 0 ? (
          <Badge tone="neutral">{t('indexers.prio', { prio: String(ix.priority) })}</Badge>
        ) : null}
        {ix.hasApiKey ? <Badge tone="success">{t('indexers.keySet')}</Badge> : null}
      </Row>

      <Box mt={16}>
        <Divider color="tint/6" />
        <Row between gap={12} pt={14}>
          <TestLine ix={ix} test={test} />
          <Row gap={8}>
            <Button
              variant="glass"
              size="sm"
              label={t('indexers.test')}
              onPress={onTest}
              loading={test?.busy}
            />
            <IconButton icon="pencil" label={t('indexers.edit')} onPress={onEdit} />
          </Row>
        </Row>
      </Box>
    </Surface>
  );
}

function TestLine({ ix, test }: Readonly<{ ix: IndexerView; test?: TestState }>) {
  const t = useT();
  if (test?.busy) {
    return (
      <Text variant="meta" color="textDim" shrink={1} minW={0}>
        {t('indexers.testing')}
      </Text>
    );
  }
  if (test?.error || test?.result?.error) {
    return (
      <Text variant="meta" color="dangerHover" lines={1} shrink={1} minW={0}>
        {test.error ?? test.result?.error}
      </Text>
    );
  }
  if (test?.result) {
    return (
      <Text variant="meta" color="success" shrink={1} minW={0}>
        {t('indexers.testOk', {
          ms: String(test.result.latencyMs),
          server: test.result.serverTitle ?? 'Torznab',
        })}
        {test.result.supportsTmdb ? ` · ${t('indexers.tmdbOk')}` : ''}
      </Text>
    );
  }
  if (ix.lastError) {
    return (
      <Text variant="meta" color="dangerHover" lines={1} shrink={1} minW={0}>
        {ix.lastError}
      </Text>
    );
  }
  if (ix.lastOkAt) {
    return (
      <Text variant="meta" color="textDim" shrink={1} minW={0}>
        {t('indexers.lastOk', { date: new Date(ix.lastOkAt).toLocaleString() })}
      </Text>
    );
  }
  return (
    <Text variant="meta" color="textDim" shrink={1} minW={0}>
      {t('indexers.neverTested')}
    </Text>
  );
}
