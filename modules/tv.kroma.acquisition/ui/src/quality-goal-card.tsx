import { useT } from '@kromatv/module-sdk';
import { Box, Row, Surface, Text } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import type { JudgedFile } from './judgement-schemas';
import type { QualityGoal } from './quality-target';
import { useGoalHeadline } from './use-goal-text';

export function QualityGoalCard({
  goal,
  files,
  picker,
  action,
}: Readonly<{
  goal: QualityGoal;
  files: readonly JudgedFile[];
  picker: ReactNode;
  action: ReactNode;
}>) {
  const t = useT();
  const headline = useGoalHeadline();
  const target = goal.kind === 'target';
  const below = target && files.some((file) => file.belowTarget);
  return (
    <Surface tone="plain" radius="xl" pad="md">
      <Row wrap gap={16} align="center" justify="space-between">
        <Box flex={1} minW={240} gap={4}>
          <Text variant="overline" color="textDim">
            {t('acq.goal.eyebrow')}
          </Text>
          <Text variant="title">{target ? headline(goal) : t('acq.goal.keep')}</Text>
          {target ? null : (
            <Text variant="meta" color="textMuted">
              {t('acq.goal.keepHint')}
            </Text>
          )}
        </Box>
        <Row wrap gap={10} align="center" w={{ base: '100%', md: 'auto' }}>
          {picker}
          {below ? <Box w={{ base: '100%', md: 'auto' }}>{action}</Box> : null}
        </Row>
      </Row>
    </Surface>
  );
}
