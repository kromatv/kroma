import type { LibraryTitle } from '@kromatv/client/monitoring';
import { datedDayLabel } from '@kromatv/core';
import type { MessageKey } from '@kromatv/i18n';
import { ModuleSlot } from '@kromatv/module-sdk';
import { useFormat, useLocale, useT } from '@kromatv/ui';
import {
  Badge,
  Box,
  CheckboxFace,
  Focusable,
  Progress,
  Row,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { FollowToggle } from '#web/features/admin/monitoring-follow-toggle';
import { heldRatio } from '#web/features/admin/monitoring-index-model';
import { airStatusKey } from '#web/features/admin/monitoring-model';
import { Pill } from '#web/features/admin/pill';
import { kindMeta } from '#web/features/admin/pipeline-meta';
import { posterScrim } from '#web/shared/lib/art-styles';
import { Image } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

export const POSTER_W = 44;

export const COLUMN = {
  status: 128,
  held: 150,
  missing: 104,
  size: 84,
  airing: 110,
  search: 92,
  follow: 60,
} as const;

export interface RowColumns {
  counts: boolean;
  extras: boolean;
  airing: boolean;
}

const sDefinition = styles({
  row: { row: true, align: 'center', gap: 16, flex: true, minW: 0, px: 16, py: 12 },
});

export function LibraryRow({
  row,
  columns,
  selecting,
  selected,
  saving,
  onFollow,
  onSelect,
}: Readonly<{
  row: LibraryTitle;
  columns: RowColumns;
  selecting: boolean;
  selected: boolean;
  saving: boolean;
  onFollow: (row: LibraryTitle, monitored: boolean) => void;
  onSelect: (row: LibraryTitle) => void;
}>) {
  const t = useT();
  return (
    <Row align="center" gap={16} minW={0} flex self="stretch">
      <RowBody
        row={row}
        columns={columns}
        selecting={selecting}
        selected={selected}
        onSelect={onSelect}
      />
      {row.tmdbId === null ? null : (
        <Box w={COLUMN.search} shrink={0} align="flex-end">
          <ModuleSlot
            name="monitoring.search"
            kind={row.kind}
            tmdbId={row.tmdbId}
            title={row.title}
            season={null}
            episode={null}
            compact
          />
        </Box>
      )}
      <Box w={COLUMN.follow} shrink={0} align="center" pr={8}>
        <FollowToggle
          state={row.monitored ? 'on' : 'off'}
          name={row.title}
          busy={saving}
          disabled={row.tmdbId === null}
          reason={row.tmdbId === null ? t('monitoring.noTmdbMatch') : undefined}
          onToggle={(next) => onFollow(row, next)}
        />
      </Box>
    </Row>
  );
}

function RowBody({
  row,
  columns,
  selecting,
  selected,
  onSelect,
}: Readonly<{
  row: LibraryTitle;
  columns: RowColumns;
  selecting: boolean;
  selected: boolean;
  onSelect: (row: LibraryTitle) => void;
}>) {
  const s = useStyles(sDefinition);
  const facts = <Facts row={row} columns={columns} />;
  if (selecting) {
    return (
      <Focusable
        role="checkbox"
        checked={selected}
        disabled={row.tmdbId === null}
        label={row.title}
        onPress={() => onSelect(row)}
        ring="focusInset"
        style={s.row}
      >
        <CheckboxFace checked={selected} />
        {facts}
      </Focusable>
    );
  }
  if (row.tmdbId === null) {
    return (
      <Box flex minW={0} px={16} py={12}>
        {facts}
      </Box>
    );
  }
  return (
    <Focusable asChild label={row.title} ring="focusInset" style={s.row}>
      <RouteLink
        to="/admin/monitoring/$kind/$tmdbId"
        params={{ kind: row.kind, tmdbId: String(row.tmdbId) }}
      >
        {facts}
      </RouteLink>
    </Focusable>
  );
}

function Facts({ row, columns }: Readonly<{ row: LibraryTitle; columns: RowColumns }>) {
  return (
    <Row align="center" gap={16} minW={0} flex>
      <Poster row={row} />
      <TitleCell row={row} columns={columns} />
      {columns.counts ? <StatusCell row={row} /> : null}
      {columns.counts ? <HeldCell row={row} /> : null}
      {columns.counts ? <MissingCell row={row} /> : null}
      {columns.extras ? <SizeCell row={row} /> : null}
      {columns.airing ? <AiringCell row={row} /> : null}
    </Row>
  );
}

function Poster({ row }: Readonly<{ row: LibraryTitle }>) {
  return (
    <Box w={POSTER_W} h={66} shrink={0} radius="sm" overflow="hidden">
      <Box fill style={posterScrim(row.title)} />
      <Image src={row.posterUrl} fit="cover" fill />
    </Box>
  );
}

function TitleCell({ row, columns }: Readonly<{ row: LibraryTitle; columns: RowColumns }>) {
  const t = useT();
  const km = kindMeta(row.kind === 'show' ? 'series' : 'film');
  return (
    <Box flex minW={0} gap={4}>
      <Row gap={10} align="center" minW={0}>
        <Text variant="label" lines={1} minW={0}>
          {row.title}
        </Text>
        <Box shrink={0}>
          <Pill ink={km.color} bg={km.bg} variant="overline">
            {t(`pipeline.type.${km.typeKey}` as MessageKey)}
          </Pill>
        </Box>
      </Row>
      <Row gap={8} align="center" wrap minW={0}>
        {row.year ? (
          <Text variant="meta" color="textDim">
            {String(row.year)}
          </Text>
        ) : null}
        {columns.counts ? null : <MissingBadge row={row} />}
      </Row>
    </Box>
  );
}

function StatusCell({ row }: Readonly<{ row: LibraryTitle }>) {
  const t = useT();
  const status = airStatusKey(row.airStatus);
  return (
    <Box w={COLUMN.status} shrink={0}>
      <Text variant="meta" color="textMuted" lines={1}>
        {status ? t(status) : (row.airStatus ?? '')}
      </Text>
    </Box>
  );
}

function HeldCell({ row }: Readonly<{ row: LibraryTitle }>) {
  const t = useT();
  const ratio = heldRatio(row);
  if (ratio === null) {
    return (
      <Box w={COLUMN.held} shrink={0}>
        <Text variant="meta" color="textMuted" lines={1}>
          {row.kind === 'show'
            ? t('monitoring.onDiskCount', { count: row.onDisk })
            : t(row.onDisk > 0 ? 'monitoring.st.available' : 'monitoring.st.untracked')}
        </Text>
      </Box>
    );
  }
  return (
    <Box w={COLUMN.held} shrink={0} gap={6}>
      <Text variant="meta" color="textDim">
        {t('monitoring.monitoredOf', { available: row.available, monitored: row.monitoredUnits })}
      </Text>
      <Progress
        value={ratio}
        thickness={3}
        color={row.missing === 0 ? 'success' : 'accent'}
        label={t('monitoring.statOnDisk')}
      />
    </Box>
  );
}

function MissingCell({ row }: Readonly<{ row: LibraryTitle }>) {
  return (
    <Box w={COLUMN.missing} shrink={0} align="flex-start">
      <MissingBadge row={row} />
    </Box>
  );
}

function MissingBadge({ row }: Readonly<{ row: LibraryTitle }>) {
  const t = useT();
  if (row.missing > 0) {
    return <Badge tone="warning">{t('monitoring.missingCount', { count: row.missing })}</Badge>;
  }
  if (row.grabbed > 0) {
    return <Badge tone="info">{t('monitoring.grabbedCount', { count: row.grabbed })}</Badge>;
  }
  if (!row.monitored) return null;
  return <Badge tone="success">{t('monitoring.allHere')}</Badge>;
}

function SizeCell({ row }: Readonly<{ row: LibraryTitle }>) {
  const fmt = useFormat();
  return (
    <Box w={COLUMN.size} shrink={0} align="flex-end">
      <Text variant="meta" color="textMuted" lines={1}>
        {row.sizeBytes > 0 ? fmt.bytes(row.sizeBytes) : ''}
      </Text>
    </Box>
  );
}

function AiringCell({ row }: Readonly<{ row: LibraryTitle }>) {
  const locale = useLocale();
  return (
    <Box w={COLUMN.airing} shrink={0} align="flex-end">
      <Text variant="meta" color="textMuted" lines={1}>
        {row.nextAirDate ? datedDayLabel(row.nextAirDate, locale) : ''}
      </Text>
    </Box>
  );
}
