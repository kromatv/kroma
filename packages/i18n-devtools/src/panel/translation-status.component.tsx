import { Box, Column, Row, Text } from '@kromatv/ui/kit';
import { useSyncExternalStore } from 'react';
import { GRADE_PAINT } from '../overlay/highlight';
import { heldStatus, onStatusChange } from '../overlay/review';

const DOT = 8;

const COUNTED = ['missing', 'outdated', 'unreviewed'] as const;

function percent(share: number): string {
  return `${Math.floor(share * 100)}%`;
}

/** How the rendered locale stands against the source language: the share a
 *  reader gets in it, and what is missing, outdated or unreviewed, each in the
 *  colour the overlay marks it with. Absent until the dev server has said. */
export function TranslationStatus() {
  const status = useSyncExternalStore(onStatusChange, heldStatus, heldStatus);
  if (!status) {
    return null;
  }
  return (
    <Column gap={6}>
      <Row between gap={8}>
        <Text variant="meta" color="textMuted">
          {`Translated (${status.locale})`}
        </Text>
        <Text variant="meta">{percent(status.coverage)}</Text>
      </Row>
      <Row align="center" gap={10} wrap>
        {COUNTED.map((grade) => (
          <Row key={grade} align="center" gap={6}>
            <Box w={DOT} h={DOT} shrink={0} radius="circle" bg={GRADE_PAINT[grade]} />
            <Text variant="meta" color="textDim">{`${status[grade]} ${grade}`}</Text>
          </Row>
        ))}
      </Row>
    </Column>
  );
}
