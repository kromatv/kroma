import { useT } from '@kroma/module-sdk';
import { CONTROL, type ColorValue, Menu, Row, Table } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import {
  RowAddedCell,
  RowProgressCell,
  RowSpeedCell,
  RowStatusCell,
  RowTitleCell,
} from './download-cells';
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

export function DownloadRowView({
  dl,
  live,
  busy,
  onPause,
  onResume,
  onRetry,
  onAskPeers,
  onRelink,
  onContents,
  onRemove,
  showClient = false,
}: Readonly<{
  dl: DownloadView;
  live?: LiveDl;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onAskPeers: () => void;
  onRelink: () => void;
  onContents: () => void;
  onRemove: () => void;
  showClient?: boolean;
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
  const active = status === 'downloading' || status === 'queued' || status === 'seeding';

  return (
    <Table.Row>
      <Table.Cell>
        <RowTitleCell dl={dl} />
      </Table.Cell>
      <Table.Cell>
        <RowProgressCell dl={dl} progress={progress} tone={tone} />
      </Table.Cell>
      <Table.Cell>
        <RowSpeedCell dl={dl} active={active} stat={stat} />
      </Table.Cell>
      <Table.Cell>
        <RowStatusCell
          dl={dl}
          status={status}
          tone={tone}
          active={active}
          showClient={showClient}
        />
      </Table.Cell>
      <Table.Cell>
        <RowAddedCell dl={dl} />
      </Table.Cell>
      <Table.Cell>
        <RowActionsMenu
          dl={dl}
          status={status}
          active={active}
          busy={busy}
          onPause={onPause}
          onResume={onResume}
          onRetry={onRetry}
          onAskPeers={onAskPeers}
          onRelink={onRelink}
          onContents={onContents}
          onRemove={onRemove}
        />
      </Table.Cell>
    </Table.Row>
  );
}

function useOpenInKroma(dl: DownloadView): (() => void) | null {
  const navigate = useNavigate();
  const localId = dl.localId;
  if (!localId) return null;
  return () =>
    navigate({
      to: dl.kind === 'movie' ? '/movies/$id' : '/shows/$id',
      params: { id: localId },
    });
}

function openTrackerPage(url: string | null | undefined): (() => void) | null {
  if (!url) return null;
  return () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };
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
  onRelink,
  onContents,
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
  onRelink: () => void;
  onContents: () => void;
  onRemove: () => void;
}>) {
  const t = useT();
  const pausable = active;
  const resumable = status === 'paused';
  // Only meaningful while the torrent is live in the engine.
  const canAskPeers = active || status === 'seeding';
  const openInKroma = useOpenInKroma(dl);
  const openTracker = openTrackerPage(dl.detailsUrl);

  return (
    <Row justify="flex-end">
      <Menu.Root label={t('downloads.rowActions')} align="end">
        <Menu.Trigger diameter={CONTROL.sm.height} />
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
        <Menu.Item icon="link" label={t('downloads.relink')} onSelect={onRelink} disabled={busy} />
        <Menu.Item icon="list" label={t('contents.title')} onSelect={onContents} />
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
    </Row>
  );
}
