import { formatBytes } from '@kroma/core';
import { type MessageKey, useT } from '@kroma/module-sdk';
import { type ColorValue, color, Menu, Progress } from '@kroma/ui/kit';
import { IconExternalLink, IconMovie, IconUsers } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import type { DownloadView } from './schemas';

/** Live per-download overlay fed by `download.progress` WS frames. */
export interface LiveDl {
  progress: number;
  downBps: number;
  upBps: number;
  peers: number;
  peersSeen: number;
  state: string;
}

const STATUS_TONE: Record<string, ColorValue> = {
  queued: 'text/55',
  downloading: 'accent',
  seeding: 'success',
  completed: 'success',
  imported: 'success',
  paused: 'text/55',
  failed: 'danger',
  removed: 'text/40',
};

function targetPill(dl: DownloadView): string | null {
  const s = String(dl.season ?? 0).padStart(2, '0');
  if (dl.kind === 'season') return `S${s}`;
  if (dl.kind === 'episode') return `S${s}E${String(dl.episodes?.[0] ?? 0).padStart(2, '0')}`;
  return null;
}

export function DownloadRowView({
  dl,
  live,
  busy,
  onPause,
  onResume,
  onRetry,
  onAskPeers,
  onRemove,
}: Readonly<{
  dl: DownloadView;
  live?: LiveDl;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onAskPeers: () => void;
  onRemove: () => void;
}>) {
  const status = live?.state && dl.status !== 'imported' ? live.state : dl.status;
  const progress = live?.progress ?? dl.progress;
  // Fall back to the polled row so speed + peers still show when the WebSocket
  // can't reach the client, e.g. through a tunnel.
  const stat = live ?? {
    downBps: dl.downBps,
    upBps: dl.upBps,
    peers: dl.peers,
    peersSeen: dl.peersSeen,
  };
  const tone = STATUS_TONE[status] ?? 'text/55';
  const active = status === 'downloading' || status === 'queued';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-white/4 px-5 py-3 md:grid-cols-[minmax(0,1fr)_190px_120px_110px_84px]">
      <RowTitleCell dl={dl} />
      <RowProgressCell dl={dl} progress={progress} tone={tone} />
      <RowSpeedCell active={active} stat={stat} />
      <RowStatusCell dl={dl} status={status} tone={tone} active={active} />
      <RowActionsMenu
        dl={dl}
        status={status}
        active={active}
        busy={busy}
        onPause={onPause}
        onResume={onResume}
        onRetry={onRetry}
        onAskPeers={onAskPeers}
        onRemove={onRemove}
      />
    </div>
  );
}

function RowTitleCell({ dl }: Readonly<{ dl: DownloadView }>) {
  const t = useT();
  const targetLabel = targetPill(dl);
  return (
    <div className="flex min-w-0 items-center gap-3">
      {dl.posterUrl ? (
        <img
          src={dl.posterUrl}
          alt=""
          loading="lazy"
          className="h-11 w-[30px] flex-[0_0_auto] rounded-[3px] bg-white/5 object-cover"
        />
      ) : (
        <div className="flex h-11 w-[30px] flex-[0_0_auto] items-center justify-center rounded-[3px] bg-white/5">
          <IconMovie size={13} className="text-white/25" />
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="truncate text-[13.5px] font-bold" title={dl.releaseTitle}>
            {dl.title}
          </span>
          {targetLabel ? (
            <span className="flex-[0_0_auto] rounded-full bg-info/[0.14] px-[7px] py-0.5 text-[9px] font-bold text-info">
              {targetLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-[3px] flex items-center gap-1.5 text-[11.5px] font-medium text-white/40">
          <span className="truncate" title={dl.releaseTitle}>
            {dl.releaseTitle}
          </span>
          {dl.indexerName ? (
            <span className="flex-[0_0_auto] text-white/30">· {dl.indexerName}</span>
          ) : null}
          {dl.detailsUrl ? (
            <a
              href={dl.detailsUrl}
              target="_blank"
              rel="noreferrer"
              title={t('downloads.viewOnTracker')}
              className="flex-[0_0_auto] text-white/40 hover:text-accent"
            >
              <IconExternalLink size={12} stroke={2} />
            </a>
          ) : null}
        </div>
        {dl.error ? (
          <div className="mt-1 truncate text-[11.5px] font-semibold text-danger-hover">
            {dl.error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RowProgressCell({
  dl,
  progress,
  tone,
}: Readonly<{ dl: DownloadView; progress: number; tone: ColorValue }>) {
  return (
    <div className="max-md:hidden">
      <Progress value={progress} color={tone} size={5} rounded />
      <div className="mt-1 flex items-center justify-between text-[11px] font-semibold tabular-nums text-white/45">
        <span>{Math.round(progress * 100)}%</span>
        {dl.sizeBytes != null ? <span>{formatBytes(dl.sizeBytes)}</span> : null}
      </div>
    </div>
  );
}

function RowSpeedCell({
  active,
  stat,
}: Readonly<{
  active: boolean;
  stat: { downBps: number; upBps: number; peers: number; peersSeen: number };
}>) {
  const t = useT();
  return (
    <div className="text-[11.5px] font-semibold tabular-nums text-white/55 max-md:hidden">
      {active ? (
        <>
          <div className="text-success">{formatBytes(stat.downBps)}/s</div>
          <div className="flex items-center gap-1.5 text-white/35">
            <span>{formatBytes(stat.upBps)}/s</span>
            <span
              className={`flex items-center gap-0.5 ${stat.peers > 0 ? 'text-info' : 'text-accent'}`}
              title={t('downloads.peersDetail', {
                live: String(stat.peers),
                seen: String(stat.peersSeen),
              })}
            >
              <IconUsers size={11} stroke={2} />
              {stat.peersSeen > stat.peers ? `${stat.peers}/${stat.peersSeen}` : stat.peers}
            </span>
          </div>
        </>
      ) : (
        <span className="text-white/30">-</span>
      )}
    </div>
  );
}

function RowStatusCell({
  dl,
  status,
  tone,
  active,
}: Readonly<{ dl: DownloadView; status: string; tone: ColorValue; active: boolean }>) {
  const t = useT();
  const ink = color(tone);
  return (
    <div className="max-md:hidden">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-[10px] py-[4px] text-[11px] font-bold"
        style={{ color: ink, background: `color-mix(in srgb, ${ink} 13%, transparent)` }}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${active ? 'animate-pulse' : ''}`}
          style={{ background: ink }}
        />
        {t(`downloads.st.${status}` as MessageKey)}
      </span>
      <div className="mt-1 text-[10.5px] font-medium text-white/35">{dl.clientName}</div>
    </div>
  );
}

function RowActionsMenu({
  dl,
  status,
  active,
  busy,
  onPause,
  onResume,
  onRetry,
  onAskPeers,
  onRemove,
}: Readonly<{
  dl: DownloadView;
  status: string;
  active: boolean;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onAskPeers: () => void;
  onRemove: () => void;
}>) {
  const t = useT();
  const navigate = useNavigate();
  const pausable = active;
  const resumable = status === 'paused';
  // Only meaningful while the torrent is live in the engine.
  const canAskPeers = active || status === 'seeding';

  const localId = dl.localId;
  const openInKroma = localId
    ? () =>
        navigate({
          to: dl.kind === 'movie' ? '/movie/$id' : '/show/$id',
          params: { id: localId },
        })
    : null;

  const openTracker = dl.detailsUrl
    ? () => {
        if (dl.detailsUrl) window.open(dl.detailsUrl, '_blank', 'noopener,noreferrer');
      }
    : null;

  return (
    <div className="flex justify-end">
      <Menu.Root label={t('downloads.rowActions')} align="end">
        <Menu.Trigger />
        {pausable ? (
          <Menu.Item
            icon="player-pause"
            label={t('downloads.pause')}
            onSelect={onPause}
            disabled={busy}
          />
        ) : null}
        {resumable ? (
          <Menu.Item
            icon="player-play"
            label={t('downloads.resume')}
            onSelect={onResume}
            disabled={busy}
          />
        ) : null}
        {canAskPeers ? (
          <Menu.Item
            icon="users-plus"
            label={t('downloads.askPeers')}
            onSelect={onAskPeers}
            disabled={busy}
          />
        ) : null}
        {/* Offered in every state: the backend re-imports a completed download
            and resets + re-adds anything else. */}
        <Menu.Item icon="refresh" label={t('downloads.retry')} onSelect={onRetry} disabled={busy} />
        {openInKroma ? (
          <Menu.Item icon="info-circle" label={t('downloads.openInKroma')} onSelect={openInKroma} />
        ) : null}
        {openTracker ? (
          <Menu.Item
            icon="external-link"
            label={t('downloads.viewOnTracker')}
            onSelect={openTracker}
          />
        ) : null}
        <Menu.Separator />
        <Menu.Item
          icon="trash"
          label={t('downloads.remove')}
          onSelect={onRemove}
          disabled={busy}
          tone="danger"
        />
      </Menu.Root>
    </div>
  );
}
