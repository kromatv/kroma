import { useBreakpoint } from '@kromatv/ui/kit';
import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { ListRow } from '@kromatv/ui/kit/molecules/list-row';
import type { ReactElement, ReactNode } from 'react';
import { ProgressMeter } from '#site/components/progress-meter.component';
import type { Progress, Stage } from '#site/lib/views';

/** What one row of a list of languages or sections says. */
export interface RowFacts {
  title: string;
  badges?: ReactNode;
  hint: string;
  progress: Progress;
  stage?: Stage;
}

function partsOf(facts: RowFacts, { wide }: { wide: boolean }): ReactNode[] {
  const meter = (
    <ProgressMeter
      progress={facts.progress}
      stage={facts.stage}
      label={`${facts.title} progress`}
    />
  );
  return [
    <Row key="title" gap={8} align="center" wrap>
      <ListRow.Label>{facts.title}</ListRow.Label>
      {facts.badges}
    </Row>,
    <ListRow.Hint key="hint" lines={1}>
      {facts.hint}
    </ListRow.Hint>,
    wide ? null : (
      <Box key="meter" pt={6}>
        {meter}
      </Box>
    ),
    <ListRow.Trailing key="trailing">
      {wide ? <Box w={220}>{meter}</Box> : null}
      <Icon name="chevron-right" size={18} color="textDim" />
    </ListRow.Trailing>,
  ];
}

/**
 * One row of a list of languages or sections: the whole row is the link
 * `children` wraps around the parts it is handed, with its title, badges, the
 * line under it, and how far it has come, beside the title on a wide screen
 * and under it on a phone.
 */
export function ProgressRow({
  facts,
  children,
}: Readonly<{ facts: RowFacts; children: (parts: ReactNode) => ReactElement }>) {
  const wide = useBreakpoint() !== 'base';
  return (
    <ListRow.Root label={facts.title} asChild>
      {children(partsOf(facts, { wide }))}
    </ListRow.Root>
  );
}
