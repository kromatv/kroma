import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, CheckboxFace, ListRow, Row, Skeleton, Text } from '@kromatv/ui/kit';
import type { MonitorCandidate } from '#web/features/admin/monitoring-model';
import { Pill } from '#web/features/admin/pill';
import { kindMeta } from '#web/features/admin/pipeline-meta';
import { posterScrim } from '#web/shared/lib/art-styles';
import { Image } from '#web/shared/ui';

export function CandidateRow({
  candidate,
  picked,
  onToggle,
}: Readonly<{ candidate: MonitorCandidate; picked: boolean; onToggle: () => void }>) {
  const t = useT();
  const km = kindMeta(candidate.kind === 'show' ? 'series' : 'film');
  return (
    <ListRow.Root
      chevron={false}
      role="checkbox"
      checked={picked}
      label={candidate.title}
      onPress={onToggle}
    >
      <ListRow.Leading>
        <Row gap={12} align="center">
          <CheckboxFace checked={picked} />
          <Box w={36} h={52} shrink={0} radius="xs" overflow="hidden">
            <Box fill style={posterScrim(candidate.title)} />
            <Image src={candidate.posterUrl} fit="cover" fill />
          </Box>
        </Row>
      </ListRow.Leading>
      <ListRow.Label>{candidate.title}</ListRow.Label>
      <Row gap={8} align="center" wrap>
        <Pill ink={km.color} bg={km.bg} variant="overline">
          {t(`pipeline.type.${km.typeKey}` as MessageKey)}
        </Pill>
        {candidate.year ? (
          <Text variant="meta" color="textDim">
            {String(candidate.year)}
          </Text>
        ) : null}
      </Row>
    </ListRow.Root>
  );
}

const PLACEHOLDERS = [0, 1, 2, 3];

export function CandidatesSkeleton() {
  return (
    <Box gap={8} aria-busy>
      {PLACEHOLDERS.map((row) => (
        <Skeleton key={row} w="100%" h={72} radius="xl" />
      ))}
    </Box>
  );
}
