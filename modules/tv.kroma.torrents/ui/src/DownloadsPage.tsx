// Admin "Téléchargements": the live download queue (progress fed by a
// page-scoped download.progress stream, slow poll as the safety net), a VPN
// status banner, aggregate stat cards and the download-clients section.

import { formatBytes } from '@kroma/core';
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
  Button,
  Dialog,
  DialogActions,
  EmptyState,
  PageHeader,
  StatCard,
  TableSkeleton,
} from '@kroma/ui/kit';
import { IconShieldCheck, IconShieldX } from '@tabler/icons-react';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { useTorrentsApi } from './api';
import { DownloadClientsSection } from './download-clients';
import { DownloadRowView, type LiveDl } from './download-row';
import { ManualGrabModal } from './manual-grab';
import type { DownloadCompletedEvent, DownloadProgressEvent, DownloadView } from './schemas';

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
  const [wipeData, setWipeData] = useState(true);
  const [manual, setManual] = useState(false);

  // Slow poll = reconnect/missed-event safety net; progress rides the WS.
  const { data, failed, reload } = usePoll(
    ['admin', 'downloads'],
    () => torrents.downloads(),
    10000,
  );

  const lastReloadRef = useRef(0);
  const throttledReload = useCallback(() => {
    const now = Date.now();
    if (now - lastReloadRef.current < 1500) return;
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

  const downloads = data?.downloads ?? [];
  const activeRows = downloads.filter((d) =>
    ['queued', 'downloading', 'seeding', 'paused'].includes(d.status),
  );
  const doneRows = downloads.filter(
    (d) => !['queued', 'downloading', 'seeding', 'paused'].includes(d.status),
  );
  // Aggregate from the live WS event when present, else the polled row, so the
  // totals are right even without the WebSocket (e.g. through a tunnel).
  const totalDown = activeRows.reduce((sum, d) => sum + (live[d.id]?.downBps ?? d.downBps), 0);
  const totalUp = activeRows.reduce((sum, d) => sum + (live[d.id]?.upBps ?? d.upBps), 0);
  const vpn = data?.vpn ?? null;

  if (!canQueue) return <Denied />;
  if (!data) return failed ? <ModuleFailed retry={reload} /> : <ModuleLoading />;

  return (
    <>
      <PageHeader
        title={t('admin.downloadsTitle')}
        subtitle={t('admin.downloadsSub')}
        action={
          <Button
            variant="primary"
            icon="download"
            label={t('manual.title')}
            onPress={() => setManual(true)}
          />
        }
      />

      {/* spacer to match the standard PageHeader → content rhythm */}
      <div className="mt-6" />

      {vpn ? <VpnBanner vpn={vpn} /> : null}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('downloads.statActive')} value={String(activeRows.length)} />
        <StatCard label={t('downloads.statDown')} value={`${formatBytes(totalDown)}/s`} />
        <StatCard label={t('downloads.statUp')} value={`${formatBytes(totalUp)}/s`} />
        <StatCard label={t('downloads.statHistory')} value={String(doneRows.length)} />
      </div>

      {activeRows.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
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
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#121216] shadow-[0_10px_28px_rgba(0,0,0,.3)]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-white/6 bg-[#15151A] px-5 py-3 md:grid-cols-[minmax(0,1fr)_190px_120px_110px_84px]">
          <Head>{t('downloads.colRelease')}</Head>
          <Head className="max-md:hidden">{t('downloads.colProgress')}</Head>
          <Head className="max-md:hidden">{t('downloads.colSpeed')}</Head>
          <Head className="max-md:hidden">{t('downloads.colStatus')}</Head>
          <span />
        </div>
        {downloads.map((dl) => (
          <DownloadRowView
            key={dl.id}
            dl={dl}
            live={live[dl.id]}
            busy={busy}
            onPause={() => act(() => torrents.pause(dl.id))}
            onResume={() => act(() => torrents.resume(dl.id))}
            onRetry={() => act(() => torrents.retry(dl.id))}
            onAskPeers={() => act(() => torrents.reannounce(dl.id))}
            onRemove={() => {
              setWipeData(true);
              setConfirm(dl);
            }}
          />
        ))}
        {data === null ? <TableSkeleton rows={6} /> : null}
        {data && downloads.length === 0 ? (
          <div className="py-6">
            <EmptyState icon="download" title={t('downloads.empty')} />
          </div>
        ) : null}
      </div>

      {canSettings ? <DownloadClientsSection /> : null}

      {confirm ? (
        <Dialog
          open
          title={t('downloads.removeTitle')}
          onClose={() => setConfirm(null)}
          width={520}
        >
          <p className="text-[13.5px] leading-relaxed text-white/70">
            {t('downloads.removeBody', { title: confirm.title })}
          </p>
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-semibold text-white/80">
            <input
              type="checkbox"
              checked={wipeData}
              onChange={(e) => setWipeData(e.target.checked)}
              className="h-4 w-4 accent-[#E8536A]"
            />
            {t('downloads.removeData')}
          </label>
          <DialogActions
            onCancel={() => setConfirm(null)}
            cancelLabel={t('common.cancel')}
            onConfirm={() => {
              const dl = confirm;
              setConfirm(null);
              act(() => torrents.remove(dl.id, { deleteData: wipeData }));
            }}
            confirmLabel={t('downloads.removeConfirm')}
            busy={busy}
          />
        </Dialog>
      ) : null}

      {manual ? <ManualGrabModal onClose={() => setManual(false)} onAdded={reload} /> : null}
    </>
  );
}

function VpnBanner({
  vpn,
}: Readonly<{ vpn: { connected: boolean; exitIp: string | null; paused: boolean } }>) {
  const t = useT();
  let message: string;
  if (vpn.connected) message = t('downloads.vpnOk', { ip: vpn.exitIp ?? '?' });
  else if (vpn.paused) message = t('downloads.vpnBlocked');
  else message = t('downloads.vpnDown');
  return (
    <div
      className={`mb-4 flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold ${
        vpn.connected
          ? 'border-[#46D08D]/30 bg-[#46D08D]/10 text-[#46D08D]'
          : 'border-[#F4B642]/30 bg-[#F4B642]/10 text-[#F4B642]'
      }`}
    >
      {vpn.connected ? (
        <IconShieldCheck size={15} stroke={2} />
      ) : (
        <IconShieldX size={15} stroke={2} />
      )}
      {message}
    </div>
  );
}

function Head({ children, className = '' }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <span
      className={`text-[9.5px] font-bold uppercase tracking-[.12em] text-white/40 ${className}`}
    >
      {children}
    </span>
  );
}
