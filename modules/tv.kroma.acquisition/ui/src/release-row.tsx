import type { ScoredReleaseView } from '@kromatv/client/requests';
import { TABULAR, Table, useFormat, useT } from '@kromatv/module-sdk';
import { Box, confirm, Icon, Table as Kit, Row, Text, useBreakpoint } from '@kromatv/ui/kit';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { EffectPill, FlagBadges, FormatPills, QualityPill, ScorePill } from './judgement-pills';
import { useRefusalText } from './refusal-text';
import { ScoreBreakdown } from './release-breakdown';
import { BLANK, IndexerName, SeedersCell, SizeCell } from './release-cells';
import { targetLabel } from './release-sort';

export function ReleaseRow({
  release,
  canGrab,
  busy,
  onGrab,
}: Readonly<{
  release: ScoredReleaseView;
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const [open, setOpen] = useState(false);
  const narrow = useBreakpoint() === 'base';
  return (
    <>
      <Kit.Row asChild>
        <Pressable accessibilityState={{ expanded: open }} onPress={() => setOpen((was) => !was)}>
          <Table.Cell>
            <EffectPill verdict={release.verdict} />
          </Table.Cell>
          <Table.Cell>
            <ReleaseHeading release={release} open={open} />
            {narrow ? (
              <StackedFacts release={release} canGrab={canGrab} busy={busy} onGrab={onGrab} />
            ) : null}
          </Table.Cell>
          <Table.Cell>
            <Quality release={release} />
          </Table.Cell>
          <SizeCell sizeBytes={release.sizeBytes} />
          <SeedersCell seeders={release.seeders} />
          <Table.Cell>
            <Score release={release} />
          </Table.Cell>
          <Table.Cell>
            <GrabAction release={release} canGrab={canGrab} busy={busy} onGrab={onGrab} />
          </Table.Cell>
        </Pressable>
      </Kit.Row>
      {open ? (
        <Box px={16} pt={10} bg="surface1">
          <Text variant="meta" color="text" selectable>
            {release.title}
          </Text>
        </Box>
      ) : null}
      {open ? <ScoreBreakdown release={release} /> : null}
    </>
  );
}

function ReleaseHeading({
  release,
  open,
}: Readonly<{ release: ScoredReleaseView; open: boolean }>) {
  const t = useT();
  const refusalText = useRefusalText();
  const rejected = release.score == null;
  const target = targetLabel(release);
  const refusal = refusalText(release.refusal, release.rejected);
  const scored = release.formats.filter((format) => format.score !== 0);
  return (
    <Row gap={8} align="flex-start" minW={0}>
      <Box pt={2}>
        <Icon
          name={open ? 'chevron-down' : 'chevron-right'}
          size={13}
          thickness={2.4}
          color="textDim"
        />
      </Box>
      <Box minW={0} flex gap={4}>
        <Text variant="label" lines={1} color={rejected ? 'textDim' : 'text'}>
          {release.title}
        </Text>
        <Row wrap gapX={10} gapY={4} align="center" minW={0}>
          {target ? (
            <Text variant="meta" color="info">
              {target}
            </Text>
          ) : null}
          <IndexerName name={release.indexerName} detailsUrl={release.detailsUrl} />
          {release.publishedAt ? <Published at={release.publishedAt} /> : null}
          <FlagBadges flags={release.flags} />
          {refusal ? (
            <Text variant="meta" color="dangerHover" lines={1}>
              {t('acq.refusedBy', { reason: refusal })}
            </Text>
          ) : (
            <FormatPills formats={scored} />
          )}
        </Row>
      </Box>
    </Row>
  );
}

function Published({ at }: Readonly<{ at: string }>) {
  const fmt = useFormat();
  return (
    <Text variant="meta" color="textDim">
      {fmt.elapsed(at)}
    </Text>
  );
}

function StackedFacts({
  release,
  canGrab,
  busy,
  onGrab,
}: Readonly<{
  release: ScoredReleaseView;
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const fmt = useFormat();
  return (
    <Row wrap between gap={10} align="center" pt={8}>
      <Row wrap gapX={12} gapY={6} align="center" flex minW={0}>
        <EffectPill verdict={release.verdict} />
        <Quality release={release} />
        <Text variant="meta" color="textDim" style={TABULAR}>
          {release.sizeBytes == null ? BLANK : fmt.bytes(release.sizeBytes)}
        </Text>
        <Text variant="meta" color="success" style={TABULAR}>
          {release.seeders ?? BLANK}
        </Text>
        <Score release={release} />
      </Row>
      <GrabAction release={release} canGrab={canGrab} busy={busy} onGrab={onGrab} />
    </Row>
  );
}

function Quality({ release }: Readonly<{ release: ScoredReleaseView }>) {
  if (!release.quality) {
    return (
      <Text variant="meta" color="textDim">
        {BLANK}
      </Text>
    );
  }
  return <QualityPill quality={release.quality} allowed={release.score != null} />;
}

function Score({ release }: Readonly<{ release: ScoredReleaseView }>) {
  if (release.score == null) {
    return (
      <Text variant="meta" color="textDim" style={TABULAR}>
        {BLANK}
      </Text>
    );
  }
  return <ScorePill score={release.score} />;
}

function GrabAction({
  release,
  canGrab,
  busy,
  onGrab,
}: Readonly<{
  release: ScoredReleaseView;
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const t = useT();
  if (!canGrab || !release.grabbable) return null;
  const rejected = release.score == null;
  const take = async () => {
    const yes =
      !rejected ||
      (await confirm({
        title: t('acq.grabAnywayTitle'),
        message: t('acq.grabAnywayHint', { name: release.title }),
        confirmLabel: t('requests.grabAnyway'),
        cancelLabel: t('common.cancel'),
      }));
    if (yes) onGrab(release);
  };
  return (
    <Table.Action
      tone={grabTone(release.upgrade, rejected)}
      icon={release.upgrade ? 'refresh' : 'download'}
      label={`${t(grabLabelKey(release.upgrade, rejected))} ${release.title}`}
      disabled={busy}
      onPress={() => void take()}
    />
  );
}

function grabTone(upgrade: boolean, rejected: boolean): 'textMuted' | 'hdr' | 'accent' {
  if (rejected) return 'textMuted';
  return upgrade ? 'hdr' : 'accent';
}

function grabLabelKey(upgrade: boolean, rejected: boolean): string {
  if (rejected) return 'requests.grabAnyway';
  return upgrade ? 'requests.grabUpgrade' : 'requests.grab';
}
