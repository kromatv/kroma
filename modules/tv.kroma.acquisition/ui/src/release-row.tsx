import type { ScoredReleaseView } from '@kromatv/client/requests';
import { TABULAR, Table, useT } from '@kromatv/module-sdk';
import { Box, Divider, Icon, Row, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { FormatPills, QualityPill, ScorePill, VerdictLine } from './judgement-pills';
import { BLANK, ReleaseFacts } from './release-cells';
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const rejected = release.score == null;
  const target = targetLabel(release);

  return (
    <>
      <Table.Row onPress={() => setOpen((was) => !was)}>
        <Table.Cell>
          <Row gap={8}>
            <Icon
              name={open ? 'chevron-down' : 'chevron-right'}
              size={13}
              thickness={2.4}
              color="textDim"
            />
            <Box minW={0} flex gap={2}>
              <Text variant="meta" lines={1} color={rejected ? 'textDim' : 'text'}>
                {release.title}
              </Text>
              <Row wrap gapX={10} align="center">
                {target ? (
                  <Text variant="meta" color="info">
                    {target}
                  </Text>
                ) : null}
                {release.verdict ? <VerdictLine verdict={release.verdict} /> : null}
                {release.rejected ? (
                  <Text variant="meta" color="dangerHover" lines={1}>
                    {release.rejected}
                  </Text>
                ) : null}
              </Row>
              <FormatPills formats={release.formats} />
            </Box>
          </Row>
        </Table.Cell>
        <Table.Cell>
          {release.quality ? (
            <QualityPill quality={release.quality} allowed={!rejected} />
          ) : (
            <Text variant="meta" color="textDim">
              {BLANK}
            </Text>
          )}
        </Table.Cell>
        <ReleaseFacts
          indexerName={release.indexerName}
          detailsUrl={release.detailsUrl}
          sizeBytes={release.sizeBytes}
          seeders={release.seeders}
        />
        <Table.Cell>
          {release.score == null ? (
            <Text variant="meta" color="textDim" style={TABULAR}>
              {BLANK}
            </Text>
          ) : (
            <ScorePill score={release.score} />
          )}
        </Table.Cell>
        <Table.Cell>
          {canGrab && release.grabbable ? (
            <Table.Action
              tone={release.upgrade ? 'hdr' : 'accent'}
              icon={release.upgrade ? 'refresh' : 'download'}
              label={t(grabLabelKey(release.upgrade, rejected))}
              disabled={busy}
              onPress={() => onGrab(release)}
            />
          ) : null}
        </Table.Cell>
      </Table.Row>
      {open ? <ScoreBreakdown release={release} /> : null}
    </>
  );
}

function grabLabelKey(upgrade: boolean, rejected: boolean): string {
  if (rejected) return 'requests.grabAnyway';
  return upgrade ? 'requests.grabUpgrade' : 'requests.grab';
}

function ScoreBreakdown({ release }: Readonly<{ release: ScoredReleaseView }>) {
  const t = useT();
  return (
    <Box px={16} pb={14} bg="surface1">
      <Divider color="tint/5" />
      {release.breakdown.length === 0 ? (
        <Text variant="meta" color="textDim" pt={10}>
          {release.rejected ?? t('requests.noBreakdown')}
        </Text>
      ) : (
        <Box gap={4} pt={10}>
          {release.breakdown.map((line) => (
            <Row key={`${line.rule}-${line.note}`} between gap={12}>
              <Text variant="meta" color="textDim" lines={1} minW={0}>
                {line.rule} · {line.note}
              </Text>
              <Text
                variant="meta"
                color={line.delta >= 0 ? 'success' : 'dangerHover'}
                shrink={0}
                style={TABULAR}
              >
                {line.delta >= 0 ? `+${line.delta}` : line.delta}
              </Text>
            </Row>
          ))}
        </Box>
      )}
    </Box>
  );
}
