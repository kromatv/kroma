import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { ReactNode } from 'react';
import { ProgressMeter } from '#site/components/progress-meter.component';
import type { Progress } from '#site/lib/views';

function Heading({
  title,
  detail,
  badges,
}: Readonly<{ title: string; detail?: string; badges?: ReactNode }>) {
  return (
    <Column gap={2} grow={1} shrink={1} basis={220} minW={0}>
      <Row gap={8} align="center" wrap>
        <Text variant="label">{title}</Text>
        {badges}
      </Row>
      {detail ? (
        <Text variant="meta" color="textDim" lines={1}>
          {detail}
        </Text>
      ) : null}
    </Column>
  );
}

/** One line of a progress list: what it is, how far along it is, and the link that opens it. */
export function ProgressRow({
  title,
  detail,
  badges,
  progress,
  action,
}: Readonly<{
  title: string;
  detail?: string;
  badges?: ReactNode;
  progress: Progress;
  action: ReactNode;
}>) {
  return (
    <Row gap={16} wrap align="center" px={16} py={14}>
      <Heading title={title} detail={detail} badges={badges} />
      <Box grow={1} shrink={1} basis={200} minW={0}>
        <ProgressMeter progress={progress} label={`${title} progress`} />
      </Box>
      <Box shrink={0} ml="auto">
        {action}
      </Box>
    </Row>
  );
}
