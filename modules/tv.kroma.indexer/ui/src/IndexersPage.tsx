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
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  Surface,
  Switch,
  TableSkeleton,
} from '@kroma/ui/kit';
import { IconAntenna } from '@tabler/icons-react';
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
      <div className="flex items-center gap-2">
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
      </div>
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

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
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
      </div>

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
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-11 w-11 flex-[0_0_44px] items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-accent">
            <IconAntenna size={20} stroke={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="truncate text-[15.5px] font-bold">{ix.name}</span>
              {!ix.enabled ? <Badge tone="neutral">{t('indexers.disabled')}</Badge> : null}
            </div>
            <div className="mt-0.5 truncate text-[12.5px] font-medium text-dim">{ix.url}</div>
          </div>
        </div>
        <Switch checked={ix.enabled} onChange={onToggle} label={ix.name} />
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-white/55">
        <Badge tone={ix.kind === 'builtin' ? 'warning' : 'info'}>
          {ix.kind === 'builtin' ? t('indexers.builtin') : t('indexers.torznab')}
        </Badge>
        <Badge tone="info">{t('indexers.cats', { cats: ix.categories.join(', ') })}</Badge>
        {ix.priority !== 0 ? (
          <Badge tone="neutral">{t('indexers.prio', { prio: String(ix.priority) })}</Badge>
        ) : null}
        {ix.hasApiKey ? <Badge tone="success">{t('indexers.keySet')}</Badge> : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/6 pt-3.5">
        <TestLine ix={ix} test={test} />
        <div className="flex items-center gap-2">
          <Button
            variant="glass"
            size="sm"
            label={t('indexers.test')}
            onPress={onTest}
            loading={test?.busy}
          />
          <IconButton icon="pencil" label={t('indexers.edit')} onPress={onEdit} />
        </div>
      </div>
    </Surface>
  );
}

function TestLine({ ix, test }: Readonly<{ ix: IndexerView; test?: TestState }>) {
  const t = useT();
  if (test?.busy) {
    return (
      <span className="text-[12.5px] font-semibold text-white/45">{t('indexers.testing')}</span>
    );
  }
  if (test?.error || test?.result?.error) {
    return (
      <span className="min-w-0 truncate text-[12.5px] font-semibold text-danger-hover">
        {test.error ?? test.result?.error}
      </span>
    );
  }
  if (test?.result) {
    return (
      <span className="text-[12.5px] font-semibold text-success">
        {t('indexers.testOk', {
          ms: String(test.result.latencyMs),
          server: test.result.serverTitle ?? 'Torznab',
        })}
        {test.result.supportsTmdb ? ` · ${t('indexers.tmdbOk')}` : ''}
      </span>
    );
  }
  if (ix.lastError) {
    return (
      <span className="min-w-0 truncate text-[12.5px] font-semibold text-danger-hover">
        {ix.lastError}
      </span>
    );
  }
  if (ix.lastOkAt) {
    return (
      <span className="text-[12.5px] font-medium text-white/45">
        {t('indexers.lastOk', { date: new Date(ix.lastOkAt).toLocaleString() })}
      </span>
    );
  }
  return (
    <span className="text-[12.5px] font-medium text-white/35">{t('indexers.neverTested')}</span>
  );
}
