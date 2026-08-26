import { type MessageKey, useFormat, useT } from '@kroma/module-sdk';
import {
  Badge,
  Box,
  type ColorValue,
  color,
  Icon,
  Img,
  Menu,
  Progress,
  Row,
  styles,
  Text,
  Tooltip,
  useBreakpoint,
} from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import type { CSSProperties, ReactNode } from 'react';
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

const WIDE_COLUMNS = 'minmax(0, 1fr) 190px 120px 110px 84px';
const NARROW_COLUMNS = 'minmax(0, 1fr) auto';

const TABLE_CELLS: CSSProperties = {
  display: 'grid',
  alignItems: 'center',
  gap: 16,
  padding: '12px 20px',
};

const TABLE_HEAD: CSSProperties = {
  ...TABLE_CELLS,
  background: 'var(--kroma-surface-1)',
  borderBottom: '1px solid color-mix(in srgb, var(--kroma-tint) 6%, transparent)',
};

const TABLE_ROW: CSSProperties = {
  ...TABLE_CELLS,
  borderBottom: '1px solid color-mix(in srgb, var(--kroma-tint) 4%, transparent)',
};

const TABLE_HEAD_WIDE: CSSProperties = { ...TABLE_HEAD, gridTemplateColumns: WIDE_COLUMNS };
const TABLE_HEAD_NARROW: CSSProperties = { ...TABLE_HEAD, gridTemplateColumns: NARROW_COLUMNS };
const TABLE_ROW_WIDE: CSSProperties = { ...TABLE_ROW, gridTemplateColumns: WIDE_COLUMNS };
const TABLE_ROW_NARROW: CSSProperties = { ...TABLE_ROW, gridTemplateColumns: NARROW_COLUMNS };

const STATUS_DOT: CSSProperties = { width: 6, height: 6, borderRadius: '50%', flex: '0 0 auto' };
const BREATHE = 'kroma-breathe 2s ease-in-out infinite';
const TRACKER_LINK: CSSProperties = { display: 'inline-flex', flex: '0 0 auto' };

const s = styles({
  tabular: { fontVariant: ['tabular-nums'] },
});

function targetPill(dl: DownloadView): string | null {
  const season = String(dl.season ?? 0).padStart(2, '0');
  if (dl.kind === 'season') return `S${season}`;
  if (dl.kind === 'episode') {
    return `S${season}E${String(dl.episodes?.[0] ?? 0).padStart(2, '0')}`;
  }
  return null;
}

/** The heading band of the download table. It shares its column template with
 *  <DownloadRowView>, which is why the two live together. */
export function DownloadTableHead() {
  const t = useT();
  const wide = useBreakpoint() !== 'base';
  return (
    <div style={wide ? TABLE_HEAD_WIDE : TABLE_HEAD_NARROW}>
      <HeadCell>{t('downloads.colRelease')}</HeadCell>
      {wide ? <HeadCell>{t('downloads.colProgress')}</HeadCell> : null}
      {wide ? <HeadCell>{t('downloads.colSpeed')}</HeadCell> : null}
      {wide ? <HeadCell>{t('downloads.colStatus')}</HeadCell> : null}
      <span />
    </div>
  );
}

function HeadCell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Text variant="overline" color="textDim">
      {children}
    </Text>
  );
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
  const wide = useBreakpoint() !== 'base';
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
    <div style={wide ? TABLE_ROW_WIDE : TABLE_ROW_NARROW}>
      <RowTitleCell dl={dl} />
      {wide ? <RowProgressCell dl={dl} progress={progress} tone={tone} /> : null}
      {wide ? <RowSpeedCell active={active} stat={stat} /> : null}
      {wide ? <RowStatusCell dl={dl} status={status} tone={tone} active={active} /> : null}
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
    <Row gap={12} minW={0}>
      <Box w={30} h={44} shrink={0} center radius={3} overflow="hidden" bg="tint/5">
        {dl.posterUrl ? (
          <Img src={dl.posterUrl} fill />
        ) : (
          <Icon name="movie" size={13} color="glyphDim" />
        )}
      </Box>
      <Box minW={0}>
        <Row gap={10}>
          <Text variant="label" lines={1}>
            {dl.title}
          </Text>
          {targetLabel ? <Badge tone="info">{targetLabel}</Badge> : null}
        </Row>
        <Row gap={6} mt={3} minW={0}>
          <Text variant="meta" color="text/40" lines={1}>
            {dl.releaseTitle}
          </Text>
          {dl.indexerName ? (
            <Text variant="meta" color="text/30" shrink={0}>
              · {dl.indexerName}
            </Text>
          ) : null}
          {dl.detailsUrl ? (
            <a
              href={dl.detailsUrl}
              target="_blank"
              rel="noreferrer"
              title={t('downloads.viewOnTracker')}
              style={TRACKER_LINK}
            >
              <Icon name="external-link" size={12} thickness={2} color="glyph" />
            </a>
          ) : null}
        </Row>
        {dl.error ? (
          <Text variant="meta" color="dangerHover" lines={1} mt={4}>
            {dl.error}
          </Text>
        ) : null}
      </Box>
    </Row>
  );
}

function RowProgressCell({
  dl,
  progress,
  tone,
}: Readonly<{ dl: DownloadView; progress: number; tone: ColorValue }>) {
  const fmt = useFormat();
  return (
    <Box>
      <Progress value={progress} color={tone} thickness={5} rounded />
      <Row between mt={4}>
        <Text variant="meta" color="text/45" style={s.tabular}>
          {Math.round(progress * 100)}%
        </Text>
        {dl.sizeBytes != null ? (
          <Text variant="meta" color="text/45" style={s.tabular}>
            {fmt.bytes(dl.sizeBytes)}
          </Text>
        ) : null}
      </Row>
    </Box>
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
  const fmt = useFormat();
  if (!active) {
    return (
      <Text variant="meta" color="text/30">
        -
      </Text>
    );
  }
  const peerTone = stat.peers > 0 ? 'info' : 'accent';
  return (
    <Box>
      <Text variant="meta" color="success" style={s.tabular}>
        {fmt.bytes(stat.downBps)}/s
      </Text>
      <Row gap={6}>
        <Text variant="meta" color="text/35" style={s.tabular}>
          {fmt.bytes(stat.upBps)}/s
        </Text>
        <Tooltip
          label={t('downloads.peersDetail', {
            live: String(stat.peers),
            seen: String(stat.peersSeen),
          })}
        >
          <Row gap={2}>
            <Icon name="users" size={11} thickness={2} color={peerTone} />
            <Text variant="meta" color={peerTone} style={s.tabular}>
              {stat.peersSeen > stat.peers ? `${stat.peers}/${stat.peersSeen}` : stat.peers}
            </Text>
          </Row>
        </Tooltip>
      </Row>
    </Box>
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
    <Box>
      <Row
        self="flex-start"
        gap={6}
        px={10}
        py={4}
        radius="pill"
        style={{ backgroundColor: `color-mix(in srgb, ${ink} 13%, transparent)` }}
      >
        <span style={{ ...STATUS_DOT, background: ink, animation: active ? BREATHE : undefined }} />
        <Text variant="meta" color={tone}>
          {t(`downloads.st.${status}` as MessageKey)}
        </Text>
      </Row>
      <Text variant="meta" color="text/35" mt={4}>
        {dl.clientName}
      </Text>
    </Box>
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
  const pausable = active;
  const resumable = status === 'paused';
  // Only meaningful while the torrent is live in the engine.
  const canAskPeers = active || status === 'seeding';
  const openInKroma = useOpenInKroma(dl);
  const openTracker = openTrackerPage(dl.detailsUrl);

  return (
    <Row justify="flex-end">
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
    </Row>
  );
}
