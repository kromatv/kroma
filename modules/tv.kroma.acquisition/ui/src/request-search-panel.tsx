// What this module puts on the core's request page, through the
// `requests.detail` slot: the title's own catalogue on one side of a switch, a
// free-text sweep on the other, and whatever the last search answered over both.
//
// The catalogue leads because it is the question the page exists to answer --
// which episodes are missing -- and every search starts by pointing at a row of
// it. It lives HERE rather than in the console because all of it is acquisition:
// with this module gone the page has nothing to show but the fallback.

import type { LedgerSeason, ScoredReleaseView, SearchScope } from '@kroma/core';
import { type SlotProps, useAdminHost, useLocale, useT } from '@kroma/module-sdk';
import {
  Box,
  Button,
  Callout,
  Dialog,
  Row,
  SegmentGroup,
  Surface,
  TableSkeleton,
  Text,
} from '@kroma/ui/kit';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  type CoverageDraft,
  coveredCount,
  draftOf,
  isEmpty,
  toBody,
  toggleEpisode,
  toggleSeason,
} from './coverage-draft';
import { ReleaseTable } from './release-table';
import { RequestFreeSearch } from './request-free-search';
import { RequestLedger } from './request-ledger';
import { seasonToOpen } from './request-ledger-state';
import { type SearchState, useReleaseSearch } from './use-release-search';
import { useRequestLedger, useSeasonLedger } from './use-request-ledger';

type Mode = 'catalog' | 'free';

export function RequestSearchPanel({
  requestId,
  kind,
  title,
  canGrab,
}: Readonly<SlotProps['requests.detail']>) {
  const t = useT();
  const navigate = useNavigate();
  const locale = useLocale();
  const { client, openMediaInfo } = useAdminHost();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('catalog');
  // The pick in progress. Null while the catalogue is only being read: editing
  // what a request covers is a deliberate act, not a stray click away.
  const [draft, setDraft] = useState<CoverageDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const search = useReleaseSearch(requestId);

  const ledger = useRequestLedger(requestId, true);
  const open = picked ?? seasonToOpen(ledger.data?.seasons ?? []);
  const episodes = useSeasonLedger(requestId, open);

  return (
    <Box gap={16}>
      <Surface elevated radius="xl" pad="lg">
        <Box gap={14}>
          <Row wrap between gap={12} align="flex-start">
            <Box flex minW={160}>
              <Text variant="title" accessibilityRole="header">
                {t('requests.acquisition')}
              </Text>
            </Box>
            <Row wrap gap={10} align="center" shrink={0}>
              {kind === 'show' && draft == null && ledger.data ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon="edit"
                  label={t('requests.editCoverage')}
                  onPress={() => setDraft(draftOf(ledger.data.coverage, ledger.data.seasons))}
                />
              ) : null}
              <SegmentGroup.Root
                value={mode}
                onValueChange={setMode}
                label={t('requests.searchMode')}
              >
                <SegmentGroup.Item value="catalog">
                  <SegmentGroup.Label>{t('requests.modeCatalog')}</SegmentGroup.Label>
                </SegmentGroup.Item>
                <SegmentGroup.Item value="free">
                  <SegmentGroup.Label>{t('requests.modeFree')}</SegmentGroup.Label>
                </SegmentGroup.Item>
              </SegmentGroup.Root>
            </Row>
          </Row>

          {mode === 'free' ? (
            <RequestFreeSearch title={title} kind={kind} season={open} canGrab={canGrab} />
          ) : (
            <Catalog
              kind={kind}
              busy={search.state.busy}
              open={open}
              today={ledger.data?.today ?? ''}
              locale={locale}
              seasons={ledger.data?.seasons ?? []}
              episodes={episodes.data?.episodes ?? null}
              loading={ledger.isPending}
              failure={ledger.error}
              requestId={requestId}
              draft={draft}
              onToggleSeason={(season, on) =>
                setDraft((d) => (d ? toggleSeason(d, season, on) : d))
              }
              onToggleEpisode={(season, episode) =>
                setDraft((d) =>
                  d ? toggleEpisode(d, season, episode, episodes.data?.episodes ?? []) : d,
                )
              }
              onSeason={setPicked}
              onSearch={search.run}
              openMediaInfo={openMediaInfo}
              onOpenTitle={
                ledger.data?.localId
                  ? () =>
                      navigate({
                        to: kind === 'show' ? '/shows/$id' : '/movies/$id',
                        params: { id: ledger.data.localId as string },
                      })
                  : null
              }
            />
          )}

          {draft ? (
            <CoverageBar
              count={coveredCount(draft, ledger.data?.seasons ?? [])}
              saving={saving}
              disabled={isEmpty(draft)}
              onCancel={() => setDraft(null)}
              onSave={() => {
                setSaving(true);
                client
                  .setRequestCoverage(requestId, toBody(draft, ledger.data?.seasons ?? []))
                  .then(() => {
                    setDraft(null);
                    // The ledger and the queue behind both describe what just
                    // changed, so neither may keep answering from cache.
                    void queryClient.invalidateQueries({ queryKey: ['admin', 'requests'] });
                  })
                  .finally(() => setSaving(false));
              }}
            />
          ) : null}
        </Box>
      </Surface>

      <ResultsDialog
        state={search.state}
        canGrab={canGrab}
        onGrab={search.grab}
        onClose={search.reset}
      />
    </Box>
  );
}

// react-query hands back whatever was thrown. An Error has a message worth
// showing; anything else has no readable form, so the title above it stands
// alone rather than printing "[object Object]".
function failureText(failure: Error | null): string {
  return failure?.message ?? '';
}

// The bar that only exists while a pick is in progress: what it comes to, and
// the two ways out of it.
function CoverageBar({
  count,
  saving,
  disabled,
  onCancel,
  onSave,
}: Readonly<{
  count: number;
  saving: boolean;
  disabled: boolean;
  onCancel: () => void;
  onSave: () => void;
}>) {
  const t = useT();
  return (
    <Row wrap between gap={10} align="center">
      <Text variant="meta" color="textDim">
        {t('requests.coverageCount', { count })}
      </Text>
      <Row wrap gap={8}>
        <Button variant="ghost" size="sm" label={t('common.cancel')} onPress={onCancel} />
        <Button
          size="sm"
          icon="check"
          label={t('requests.coverageSave')}
          onPress={onSave}
          loading={saving}
          disabled={disabled}
        />
      </Row>
    </Row>
  );
}

function Catalog({
  kind,
  busy,
  open,
  today,
  locale,
  seasons,
  episodes,
  loading,
  failure,
  requestId,
  draft,
  onToggleSeason,
  onToggleEpisode,
  onSeason,
  onSearch,
  onOpenTitle,
  openMediaInfo,
}: Readonly<{
  kind: 'movie' | 'show';
  busy: boolean;
  open: number | null;
  today: string;
  locale: string;
  seasons: LedgerSeason[];
  episodes: Parameters<typeof RequestLedger>[0]['episodes'];
  loading: boolean;
  failure: Error | null;
  requestId: string;
  draft: CoverageDraft | null;
  onToggleSeason: (season: number, on: boolean) => void;
  onToggleEpisode: (season: number, episode: number) => void;
  onSeason: (season: number) => void;
  onSearch: (scope: SearchScope) => void;
  onOpenTitle: (() => void) | null;
  openMediaInfo: ((itemId: string, title: string) => void) | undefined;
}>) {
  const t = useT();
  if (failure) {
    return (
      <Callout.Root tone="danger">
        <Callout.Title>{t('requests.ledgerFailed')}</Callout.Title>
        <Callout.Detail>{failureText(failure)}</Callout.Detail>
      </Callout.Root>
    );
  }
  if (kind === 'movie') {
    return (
      <Row wrap gap={10}>
        <Button
          icon="search"
          label={t('requests.searchNow')}
          loading={busy}
          onPress={() => onSearch({ scope: 'movie' })}
        />
      </Row>
    );
  }
  return (
    <RequestLedger
      seasons={seasons}
      season={open}
      episodes={episodes}
      today={today}
      locale={locale}
      loading={loading}
      requestId={requestId}
      draft={draft}
      onToggleSeason={onToggleSeason}
      onToggleEpisode={onToggleEpisode}
      onSeason={onSeason}
      onSearchSeason={(s) => onSearch({ scope: 'season', season: s })}
      onSearchEpisode={(s, e) => onSearch({ scope: 'episode', season: s, episode: e })}
      onOpenTitle={onOpenTitle}
      onFileInfo={(ep) => {
        if (ep.itemId) openMediaInfo?.(ep.itemId, ep.name ?? '');
      }}
    />
  );
}

function ResultsDialog({
  state,
  canGrab,
  onGrab,
  onClose,
}: Readonly<{
  state: SearchState;
  canGrab: boolean;
  onGrab: (release: ScoredReleaseView) => void;
  onClose: () => void;
}>) {
  const t = useT();
  const open = state.busy || state.view != null || state.error != null;
  return (
    <Dialog.Root open={open} onClose={onClose} width="xl" title={t('requests.interactiveSearch')}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {t('requests.interactiveSearch')}
        </Text>
        <Text variant="meta" color="textDim">
          {t(state.busy ? 'requests.searchRunning' : 'requests.searchAnswered')}
        </Text>
      </Dialog.Header>
      <Dialog.Panel>
        <Box gap={12}>
          {state.error ? (
            <Callout.Root tone="danger">
              <Callout.Title>{state.error}</Callout.Title>
            </Callout.Root>
          ) : null}
          {state.grabbed ? (
            <Callout.Root tone={state.grabbed.error ? 'danger' : 'success'}>
              <Callout.Title>
                {state.grabbed.error
                  ? state.grabbed.title
                  : `${t('requests.grabbed')} ${state.grabbed.title}`}
              </Callout.Title>
            </Callout.Root>
          ) : null}
          {state.busy ? <TableSkeleton rows={6} /> : null}
          {!state.busy && state.view ? (
            <ReleaseTable
              releases={state.view.releases}
              indexers={state.view.indexers}
              canGrab={canGrab}
              busy={state.grabbing}
              onGrab={onGrab}
            />
          ) : null}
        </Box>
      </Dialog.Panel>
      <Dialog.Footer>
        <Dialog.Actions>
          <Button variant="ghost" label={t('common.close')} onPress={onClose} />
        </Dialog.Actions>
      </Dialog.Footer>
    </Dialog.Root>
  );
}
