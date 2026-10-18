import type { LibraryTitle, MonitorPreset } from '@kromatv/client/monitoring';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Divider,
  EmptyState,
  Pagination,
  Row,
  Surface,
  Text,
  useBreakpoint,
} from '@kromatv/ui/kit';
import { useMemo, useState } from 'react';
import { MonitorTitlesDialog } from '#web/features/admin/monitoring-add-dialog';
import { BulkBar } from '#web/features/admin/monitoring-bulk';
import {
  filterLibrary,
  type LibraryFilter,
  type LibraryState,
  titleKey,
} from '#web/features/admin/monitoring-index-model';
import { MonitoringNotice, useMonitoringNotice } from '#web/features/admin/monitoring-notice';
import { LibraryRow, type RowColumns } from '#web/features/admin/monitoring-title-row';
import { LibraryFilters, LibraryHead } from '#web/features/admin/monitoring-toolbar';
import { ConsoleSearch } from '#web/features/admin/table-console';
import { useLibraryIndex, useTitleFollow } from '#web/features/admin/use-monitoring';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const PER_PAGE = 50;

const FRESH: Omit<LibraryFilter, 'state'> = {
  kind: 'all',
  needle: '',
  sort: 'title',
  descending: false,
};

interface ViewProps {
  view: LibraryState;
  onView: (view: LibraryState) => void;
}

/** Every title of the library, as the Titles tab of the library page. */
export function LibraryTitles({ view, onView }: Readonly<ViewProps>) {
  const t = useT();
  const { client } = useAuth();
  const { notice, on, say } = useMonitoringNotice();
  const { data, reload } = useLibraryIndex();
  const breakpoint = useBreakpoint();

  const [rest, setRest] = useState(FRESH);
  const filter = useMemo<LibraryFilter>(() => ({ ...rest, state: view }), [rest, view]);
  const setFilter = ({ state, ...next }: LibraryFilter) => {
    if (state !== view) onView(state);
    setRest(next);
  };
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<ReadonlyMap<string, LibraryTitle>>(() => new Map());
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState(1);

  const follow = useTitleFollow({
    onSaved: (row, monitored, undo) =>
      say(
        t(monitored ? 'monitoring.saidFollowed' : 'monitoring.saidUnfollowed', {
          title: row.title,
        }),
        undo,
      ),
    onFailed: () => say(t('monitoring.actionFailed')),
  });

  const loading = data === null;
  const rows = useMemo(() => data ?? [], [data]);
  const shown = useMemo(() => filterLibrary(rows, filter), [rows, filter]);
  const columns: RowColumns = {
    counts: breakpoint !== 'base',
    extras: breakpoint === 'lg' || breakpoint === 'tv',
    airing:
      (breakpoint === 'lg' || breakpoint === 'tv') && rows.some((row) => row.nextAirDate !== null),
  };
  const chosen = [...picked.values()];
  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const page = shown.slice(
    (Math.min(at, pageCount) - 1) * PER_PAGE,
    Math.min(at, pageCount) * PER_PAGE,
  );

  const pick = (row: LibraryTitle) =>
    setPicked((previous) => {
      const next = new Map(previous);
      const key = titleKey(row);
      if (next.has(key)) next.delete(key);
      else next.set(key, row);
      return next;
    });

  const leaveSelect = () => {
    setSelecting(false);
    setPicked(new Map());
  };

  const bulk = (run: () => Promise<unknown>, said: string) => {
    setBusy(true);
    run()
      .then(async () => {
        say(said);
        leaveSelect();
        await reload();
      })
      .catch(() => say(t('monitoring.actionFailed')))
      .finally(() => setBusy(false));
  };

  const refs = () =>
    chosen.flatMap((row) => (row.tmdbId === null ? [] : [{ kind: row.kind, tmdbId: row.tmdbId }]));

  const bulkFollow = (preset: MonitorPreset | undefined) =>
    bulk(
      () => client.monitoring.bulk(refs(), preset ? { preset } : {}),
      t('monitoring.bulkDone', { count: chosen.length }),
    );

  const bulkUnfollow = () =>
    bulk(
      () => Promise.all(refs().map((ref) => client.monitoring.unmonitor(ref.kind, ref.tmdbId))),
      t('monitoring.bulkUndone', { count: chosen.length }),
    );

  return (
    <>
      <Row wrap gap={10} align="center">
        <Box flex minW={200}>
          <ConsoleSearch
            value={filter.needle}
            onChange={(needle) => setFilter({ ...filter, needle })}
            placeholder={t('monitoring.searchPlaceholder')}
          />
        </Box>
        <Button
          size="sm"
          variant="glass"
          icon="checkbox"
          active={selecting}
          label={t('monitoring.select')}
          onPress={() => (selecting ? leaveSelect() : setSelecting(true))}
        />
        <Button
          size="sm"
          icon="plus"
          label={t('monitoring.addTitle')}
          onPress={() => setAdding(true)}
        />
      </Row>

      <Box gap={12} mt={16} mb={16}>
        <LibraryFilters filter={filter} onChange={setFilter} />
        {selecting ? (
          <BulkBar
            count={chosen.length}
            shows={chosen.some((row) => row.kind === 'show')}
            busy={busy}
            onFollow={bulkFollow}
            onUnfollow={bulkUnfollow}
            onClear={leaveSelect}
          />
        ) : null}
      </Box>

      {loading ? <TableSkeleton rows={8} /> : null}

      {loading || shown.length > 0 ? null : (
        <Surface radius="xl" pad="lg" border="border">
          <EmptyState.Root icon={rows.length === 0 ? 'radar' : 'search'}>
            <EmptyState.Title>
              {rows.length === 0 ? t('monitoring.empty') : t('monitoring.noMatch')}
            </EmptyState.Title>
            {rows.length === 0 ? (
              <EmptyState.Hint>{t('monitoring.emptyHint')}</EmptyState.Hint>
            ) : null}
            {rows.length === 0 ? (
              <EmptyState.Actions>
                <Button
                  icon="plus"
                  label={t('monitoring.addTitle')}
                  onPress={() => setAdding(true)}
                />
              </EmptyState.Actions>
            ) : null}
          </EmptyState.Root>
        </Surface>
      )}

      {loading || shown.length === 0 ? null : (
        <Box gap={16}>
          <Surface radius="xl" pad="none" border="border" overflow="hidden">
            <LibraryHead
              filter={filter}
              columns={columns}
              selecting={selecting}
              onChange={setFilter}
            />
            {page.map((row) => (
              <Box key={titleKey(row)}>
                <Divider spacing={0} color="tint/4" />
                <LibraryRow
                  row={row}
                  columns={columns}
                  selecting={selecting}
                  selected={picked.has(titleKey(row))}
                  saving={follow.isSaving(row)}
                  onFollow={follow.set}
                  onSelect={pick}
                />
              </Box>
            ))}
          </Surface>
          {pageCount > 1 ? (
            <Row wrap gap={12} align="center" justify="space-between">
              <Text variant="meta" color="textDim">
                {t('monitoring.shownOf', { shown: page.length, total: shown.length })}
              </Text>
              <Pagination.Root
                page={at}
                pageCount={pageCount}
                onPageChange={setAt}
                label={t('monitoring.title')}
                size="sm"
              />
            </Row>
          ) : null}
        </Box>
      )}

      <MonitorTitlesDialog
        open={adding}
        monitored={rows.flatMap((row) =>
          row.monitored && row.tmdbId !== null ? [{ kind: row.kind, tmdbId: row.tmdbId }] : [],
        )}
        onClose={() => setAdding(false)}
        onDone={(message) => {
          say(message);
          void reload();
        }}
      />
      <MonitoringNotice notice={notice} on={on} />
    </>
  );
}
