// Interactive-search results inside the request drawer: one row per release
// (name, indexer, size, seeders, score or rejection), an expandable score
// breakdown, and a per-row grab button (wired to the download engine
// milestone; hidden until the release is grabbable AND grabbing exists).

import type { ScoredReleaseView } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Callout, Divider, Icon, IconButton, Row, Text } from '@kroma/ui/kit';
import { type CSSProperties, useState } from 'react';
import { TABULAR } from '#web/features/admin/table';
import { formatBytes } from '#web/shared/lib/adminFormat';

// The row's own disclosure: a bare control, so it states the shape a page reset
// would otherwise have given it.
const DISCLOSURE: CSSProperties = {
  display: 'flex',
  flex: 1,
  minWidth: 0,
  alignItems: 'center',
  gap: 8,
  margin: 0,
  padding: 0,
  border: 0,
  background: 'none',
  textAlign: 'left',
  cursor: 'pointer',
};

export function ReleaseList({
  releases,
  errors,
  canGrab,
  busy,
  onGrab,
}: Readonly<{
  releases: ScoredReleaseView[];
  errors: string[];
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const t = useT();
  const accepted = releases.filter((r) => r.score != null);
  const rejected = releases.filter((r) => r.score == null);

  return (
    <Box gap={8}>
      {errors.map((e) => (
        <Callout.Root key={e} tone="accent">
          <Callout.Title>{e}</Callout.Title>
        </Callout.Root>
      ))}
      {releases.length === 0 && errors.length === 0 ? (
        <Box px={12} py={16} radius="sm" bg="surface1" border="tint/7">
          <Text variant="meta" color="textDim" textAlign="center">
            {t('requests.noReleases')}
          </Text>
        </Box>
      ) : null}
      {accepted.map((r) => (
        <ReleaseRow
          key={`${r.indexerId}-${r.guid}`}
          r={r}
          canGrab={canGrab}
          busy={busy}
          onGrab={onGrab}
        />
      ))}
      {rejected.length > 0 ? (
        <Text variant="overline" color="textDim" mt={4}>
          {t('requests.rejectedReleases', { count: String(rejected.length) })}
        </Text>
      ) : null}
      {rejected.slice(0, 30).map((r) => (
        <ReleaseRow
          key={`${r.indexerId}-${r.guid}`}
          r={r}
          canGrab={canGrab}
          busy={busy}
          onGrab={onGrab}
          override
        />
      ))}
    </Box>
  );
}

function ReleaseRow({
  r,
  canGrab,
  busy,
  onGrab,
  override = false,
}: Readonly<{
  r: ScoredReleaseView;
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
  override?: boolean;
}>) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rejectedRow = r.score == null;

  return (
    <Box
      px={12}
      py={10}
      radius="lg"
      bg={rejectedRow ? 'bg' : 'surface1'}
      border={rejectedRow ? 'tint/5' : 'tint/7'}
      opacity={rejectedRow ? 0.7 : 1}
    >
      <Row gap={10}>
        <button type="button" onClick={() => setOpen((o) => !o)} style={DISCLOSURE}>
          <Icon
            name={open ? 'chevron-down' : 'chevron-right'}
            size={13}
            stroke={2.4}
            color="textDim"
          />
          <Text variant="meta" lines={1}>
            {r.title}
          </Text>
        </button>
        {r.score != null ? (
          <Row shrink={0} radius="pill" bg="accentWash/14" px={8} py={2}>
            <Text variant="meta" color="accentText" style={TABULAR}>
              {r.score}
            </Text>
          </Row>
        ) : null}
        {canGrab && r.grabbable ? (
          <IconButton
            control="sm"
            icon="download"
            active
            label={override ? t('requests.grabAnyway') : t('requests.grab')}
            onPress={() => onGrab(r)}
            disabled={busy}
          />
        ) : null}
      </Row>

      <ReleaseMeta r={r} />

      {open && r.breakdown.length > 0 ? <ScoreBreakdown breakdown={r.breakdown} /> : null}
    </Box>
  );
}

function targetLabel(r: ScoredReleaseView): string {
  const s = String(r.season ?? 0).padStart(2, '0');
  return r.target === 'season'
    ? `S${s} pack`
    : `S${s}E${String(r.episodes?.[0] ?? 0).padStart(2, '0')}`;
}

function ReleaseMeta({ r }: Readonly<{ r: ScoredReleaseView }>) {
  const t = useT();
  return (
    <Row wrap gapX={12} gapY={2} mt={4} pl={23}>
      <Row gap={4}>
        <Text variant="meta" color="textDim">
          {r.indexerName}
        </Text>
        {r.detailsUrl ? (
          <a
            href={r.detailsUrl}
            target="_blank"
            rel="noreferrer"
            title={t('downloads.viewOnTracker')}
          >
            <Icon name="external-link" size={11} stroke={2} color="textDim" />
          </a>
        ) : null}
      </Row>
      {r.sizeBytes != null ? (
        <Text variant="meta" color="textDim">
          {formatBytes(r.sizeBytes)}
        </Text>
      ) : null}
      {r.seeders != null ? (
        <Text variant="meta" color="success">
          {t('requests.seedersN', { n: String(r.seeders) })}
        </Text>
      ) : null}
      {r.target !== 'movie' ? (
        <Text variant="meta" color="info">
          {targetLabel(r)}
        </Text>
      ) : null}
      {r.rejected ? (
        <Text variant="meta" color="dangerHover">
          {r.rejected}
        </Text>
      ) : null}
    </Row>
  );
}

function ScoreBreakdown({ breakdown }: Readonly<{ breakdown: ScoredReleaseView['breakdown'] }>) {
  return (
    <>
      <Box mt={8}>
        <Divider color="tint/5" />
      </Box>
      <Box gap={4} pl={23} pt={8}>
        {breakdown.map((l) => (
          <Row key={`${l.rule}-${l.note}`} between gap={12}>
            <Text variant="meta" color="textDim" lines={1} minW={0}>
              {l.rule} · {l.note}
            </Text>
            <Text
              variant="meta"
              color={l.delta >= 0 ? 'success' : 'dangerHover'}
              shrink={0}
              style={TABULAR}
            >
              {l.delta >= 0 ? `+${l.delta}` : l.delta}
            </Text>
          </Row>
        ))}
      </Box>
    </>
  );
}
