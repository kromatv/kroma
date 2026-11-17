import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { ReactNode } from 'react';

/** How far a step of the status page has come. */
export type StepState = 'done' | 'todo' | 'working';

const BADGE = {
  done: { tone: 'success', label: 'Done' },
  todo: { tone: 'warning', label: 'To do' },
  working: { tone: 'info', label: 'Syncing' },
} as const;

/** One step of the status page: what it connects, how far it has come, and what to do about it. */
export function SetupStep({
  title,
  purpose,
  state,
  children,
}: Readonly<{ title: string; purpose: string; state: StepState; children?: ReactNode }>) {
  const badge = BADGE[state];
  return (
    <Box bg="surface1" border="border" radius="xl" p={{ base: 16, md: 20 }} gap={16}>
      <Column gap={6}>
        <Row gap={12} wrap between align="center">
          <Box shrink={1} minW={0}>
            <Text variant="title">{title}</Text>
          </Box>
          <Box>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </Box>
        </Row>
        <Text color="textMuted">{purpose}</Text>
      </Column>
      {children}
    </Box>
  );
}
