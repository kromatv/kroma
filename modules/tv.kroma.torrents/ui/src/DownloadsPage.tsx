// Admin "Téléchargements": one page of the download queue (progress fed by a
// page-scoped download.progress stream, slow poll as the safety net), a VPN
// status banner, the throughput cards above it and the download-clients section
// below.

import {
  Denied,
  ModuleFailed,
  ModuleLoading,
  useCap,
  usePoll,
  useServerEvents,
  useT,
} from '@kroma/module-sdk';
import type { VpnStatusEvent } from '@kroma/module-vpn/schemas';
import {
  Box,
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  Pagination,
  Row,
  Surface,
  Table,
  Text,
} from '@kroma/ui/kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTorrentsApi } from './api';
import { ContentsModal } from './contents-modal';
import { DownloadClientsSection } from './download-clients';
import { DOWNLOAD_BOXES } from './download-columns';
import { DownloadRowView, type LiveDl } from './download-row';
import { DownloadTableHead } from './download-table-head';
import { DownloadFilters } from './downloads-filters';
import { DownloadStats } from './downloads-stats';
import { DownloadsVpnBanner } from './downloads-vpn-banner';
import { LimitsModal } from './limits-modal';
import { LinkModal } from './link-modal';
import { ManualGrabModal } from './manual-grab';
import { RemoveDownloadDialog } from './remove-download-dialog';
import type {
  DownloadCompletedEvent,
  DownloadProgressEvent,
  DownloadQuery,
  DownloadView,
} from './schemas';
import { useDownloadsTable } from './use-downloads-table';

const POLL_MS = 10000;
const RELOAD_THROTTLE_MS = 1500;
const SEARCH_SETTLE_MS = 350;

/** The Downloads module page (`/admin/downloads`): the live download queue,
 *  VPN status banner, aggregate stats, and the download-clients section. Default
 *  export so the module runtime can `React.lazy` it into its own chunk. */
export default function DownloadsPage() {
  const t = useT();
  const torrents = useTorrentsApi();
  const canSettings = useCap('settings.manage');
  const canQueue = useCap('requests.manage') || canSettings;

  const [live, setLive] = useState<Record<string, LiveDl>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<DownloadView | null>(null);
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState<DownloadQuery>({ page: 1 });
  const [typed, setTyped] = useState('');
  useEffect(() => {
    const at = setTimeout(
      () => setQuery((q) => (q.q === (typed || undefined) ? q : { ...q, q: typed, page: 1 })),
      SEARCH_SETTLE_MS,
    );
    return () => clearTimeout(at);
  }, [typed]);

  const queryKey = useMemo(() => ['admin', 'downloads', query] as const, [query]);
  const { data, failed, reload } = usePoll(queryKey, () => torrents.downloads(query), POLL_MS);
  const shownRef = useRef(data);
  if (data) shownRef.current = data;
  const shown = data ?? shownRef.current;
  const clientsPoll = usePoll(['admin', 'downloads', 'clients'], () => torrents.clients(), 60000);
  const { table, headings, sort, onSortChange } = useDownloadsTable({
    downloads: shown?.downloads,
    page: shown?.page,
    query,
    onQueryChange: setQuery,
  });

  const lastReloadRef = useRef(0);
  const throttledReload = useCallback(() => {
    const now = Date.now();
    if (now - lastReloadRef.current < RELOAD_THROTTLE_MS) return;
    lastReloadRef.current = now;
    reload();
  }, [reload]);

  // `download.progress` frames feed the per-row overlay; terminal events
  // trigger a throttled reload (safety net beside the slow poll).
  useServerEvents<DownloadProgressEvent | DownloadCompletedEvent | VpnStatusEvent>((e) => {
    if (e.type === 'download.progress') {
      setLive((s) => ({
        ...s,
        [e.id]: {
          progress: e.progress,
          downBps: e.downBps,
          upBps: e.upBps,
          peers: e.peers,
          peersSeen: e.peersSeen,
          state: e.state,
        },
      }));
    } else if (
      e.type === 'download.completed' ||
      e.type === 'request.updated' ||
      e.type === 'vpn.status'
    ) {
      throttledReload();
    }
  });

  const act = (fn: () => Promise<unknown>) => {
    setBusy(true);
    fn()
      .catch(() => undefined)
      .finally(() => {
        setBusy(false);
        reload();
      });
  };

  const relink = async (dl: DownloadView) => {
    if (await LinkModal.call({ dl })) reload();
  };

  const editLimits = async () => {
    if (await LimitsModal.call()) reload();
  };

  if (!canQueue) return <Denied />;
  if (!shown) return failed ? <ModuleFailed retry={reload} /> : <ModuleLoading />;

  const { downloads, page, stats, vpn } = shown;
  const hasActive = stats.active > 0;

  return (
    <>
      <PageChrome
        onManual={() => setManual(true)}
        onSettings={canSettings ? editLimits : undefined}
      />

      {vpn ? <DownloadsVpnBanner vpn={vpn} /> : null}

      <DownloadStats stats={stats} />

      <DownloadFilters
        query={query}
        onQueryChange={setQuery}
        search={typed}
        onSearchChange={setTyped}
        stats={stats}
        clients={clientsPoll.data?.clients ?? []}
      />

      {hasActive ? (
        <Row wrap gap={8} mb={12}>
          <Button
            variant="glass"
            size="sm"
            icon="player-pause"
            label={t('downloads.pauseAll')}
            onPress={() => act(() => torrents.pauseAll())}
            disabled={busy}
          />
          <Button
            variant="glass"
            size="sm"
            icon="player-play"
            label={t('downloads.resumeAll')}
            onPress={() => act(() => torrents.resumeAll())}
            disabled={busy}
          />
          <Button
            variant="glass"
            size="sm"
            icon="users-plus"
            label={t('downloads.askPeers')}
            onPress={() => act(() => torrents.reannounceAll())}
            disabled={busy}
          />
        </Row>
      ) : null}

      <Surface elevated pad="none" overflow="hidden" radius="xl">
        <Table.Root
          variant="plain"
          columns={DOWNLOAD_BOXES}
          label={t('admin.downloadsTitle')}
          sort={sort}
          onSortChange={onSortChange}
        >
          <DownloadTableHead headings={headings} />
          <Table.Body>
            {table.getRowModel().rows.map(({ id, original: dl }) => (
              <DownloadRowView
                key={id}
                dl={dl}
                live={live[dl.id]}
                busy={busy}
                onPause={() => act(() => torrents.pause(dl.id))}
                onResume={() => act(() => torrents.resume(dl.id))}
                onRetry={() => act(() => torrents.retry(dl.id))}
                onAskPeers={() => act(() => torrents.reannounce(dl.id))}
                onRelink={() => relink(dl)}
                onContents={() => void ContentsModal.call({ dl })}
                onRemove={() => setConfirm(dl)}
              />
            ))}
          </Table.Body>
        </Table.Root>
        {downloads.length === 0 ? (
          <Box py={24}>
            <EmptyState.Root icon="download">
              <EmptyState.Title>{t('downloads.empty')}</EmptyState.Title>
            </EmptyState.Root>
          </Box>
        ) : null}
      </Surface>

      {page.total > 0 ? (
        <Row between wrap gap={12} mt={16}>
          <Text variant="meta" color="text/40">
            {t('downloads.pageOf', {
              first: String((page.page - 1) * page.perPage + 1),
              last: String(Math.min(page.page * page.perPage, page.total)),
              total: String(page.total),
            })}
          </Text>
          <Pagination.Root
            page={page.page}
            pageCount={Math.max(1, table.getPageCount())}
            onPageChange={(next) => table.setPageIndex(next - 1)}
            label={t('admin.downloadsTitle')}
            size="sm"
          />
        </Row>
      ) : null}

      {canSettings ? <DownloadClientsSection /> : null}

      {confirm ? (
        <RemoveDownloadDialog
          dl={confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={({ deleteData }) => {
            const dl = confirm;
            setConfirm(null);
            act(() => torrents.remove(dl.id, { deleteData }));
          }}
        />
      ) : null}

      {manual ? <ManualGrabModal onClose={() => setManual(false)} onAdded={reload} /> : null}
      <ContentsModal.Root />
      <LinkModal.Root />
      <LimitsModal.Root />
    </>
  );
}

function PageChrome({
  onManual,
  onSettings,
}: Readonly<{ onManual: () => void; onSettings?: () => void }>) {
  const t = useT();
  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.downloadsTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.downloadsSub')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          {onSettings ? (
            <IconButton icon="settings" label={t('downloads.settings')} onPress={onSettings} />
          ) : null}
          <Button variant="primary" icon="plus" label={t('manual.title')} onPress={onManual} />
        </PageHeader.Actions>
      </PageHeader.Root>
      {/* spacer to match the standard PageHeader → content rhythm */}
      <Box h={24} />
    </>
  );
}
