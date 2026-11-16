import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { ReactNode } from 'react';

/** One step of `/setup`: what it connects, whether it is done, and what to do about it. */
export function SetupStep({
  title,
  purpose,
  done,
  children,
}: Readonly<{ title: string; purpose: string; done: boolean; children?: ReactNode }>) {
  return (
    <Box bg="surface1" border="border" radius="xl" shadow="card" p={20} gap={16}>
      <Column gap={6}>
        <Row gap={12} wrap between align="center">
          <Box shrink={1} minW={0}>
            <Text variant="title">{title}</Text>
          </Box>
          {done ? <Badge tone="success">Done</Badge> : <Badge tone="warning">To do</Badge>}
        </Row>
        <Text color="textMuted">{purpose}</Text>
      </Column>
      {children}
    </Box>
  );
}
