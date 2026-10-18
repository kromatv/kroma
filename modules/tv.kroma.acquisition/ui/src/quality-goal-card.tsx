import { useT } from '@kromatv/module-sdk';
import { Box, Divider, Row, Surface, Text } from '@kromatv/ui/kit';
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
  const below = files.filter((file) => file.belowTarget).length;
  return (
    <Surface tone="plain" radius="xl" pad="md" gap={16}>
      <Row wrap gap={16} align="flex-start" justify="space-between">
        <Box flex={1} minW={240} gap={4}>
          <Text variant="overline" color="textDim">
            {t('acq.goal.eyebrow')}
          </Text>
          <Text variant="title">{target ? headline(goal) : t('acq.goal.keep')}</Text>
          <Text variant="meta" color="textMuted">
            {target ? t('acq.goal.hint') : t('acq.goal.keepHint')}
          </Text>
        </Box>
        {picker}
      </Row>
      {target && files.length > 0 ? (
        <>
          <Divider />
          <Row wrap gap={16} align="center">
            <Box flex={1} minW={200}>
              <GoalTally total={files.length} below={below} />
            </Box>
            {below > 0 ? <Box w={{ base: '100%', md: 'auto' }}>{action}</Box> : null}
          </Row>
        </>
      ) : null}
    </Surface>
  );
}

function GoalTally({ total, below }: Readonly<{ total: number; below: number }>) {
  const t = useT();
  if (total === 1) {
    return below === 0 ? (
      <Tally tone="success" text={t('acq.goal.fileReached')} />
    ) : (
      <Tally tone="accent" text={t('acq.goal.fileBelow')} />
    );
  }
  const reached = total - below;
  return (
    <Row wrap gapX={20} gapY={8} align="center">
      {reached > 0 ? (
        <Tally tone="success" text={t('acq.goal.reached', { count: reached })} />
      ) : null}
      {below > 0 ? <Tally tone="accent" text={t('acq.goal.below', { count: below })} /> : null}
    </Row>
  );
}

function Tally({ tone, text }: Readonly<{ tone: 'success' | 'accent'; text: string }>) {
  return (
    <Row gap={8} align="center">
      <Box w={8} h={8} radius="pill" bg={tone} />
      <Text variant="label">{text}</Text>
    </Row>
  );
}
