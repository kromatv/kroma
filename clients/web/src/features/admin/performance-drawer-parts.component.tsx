import type { PerfFlag, PerfSegmentName } from '@kromatv/client/performance';
import type { MessageKey } from '@kromatv/i18n';
import { TABULAR } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Box, Drawer, Grid, Row, Text } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import { PerfFlags } from '#web/features/admin/performance-flags.component';
import { PerfLink } from '#web/features/admin/performance-link.component';

/** One figure of a drawer's summary. */
export interface PerfStat {
  labelKey: MessageKey;
  value: string;
}

/** The top of every Performance drawer: what it is, then its name. */
export function PerfDrawerHead({ eyebrow, title }: Readonly<{ eyebrow: string; title: string }>) {
  return (
    <>
      <Row between mb={12}>
        <Text variant="overline" color="textDim">
          {eyebrow}
        </Text>
        <Drawer.Close />
      </Row>
      <Text variant="label" font="mono" selectable>
        {title}
      </Text>
    </>
  );
}

/** A drawer's figures, two to a row. */
export function PerfStats({ stats }: Readonly<{ stats: readonly PerfStat[] }>) {
  const t = useT();
  return (
    <Box mb={20}>
      <Grid columns={2} gap={10}>
        {stats.map((stat) => (
          <Box key={stat.labelKey} px={14} py={10} radius="lg" bg="surface1" border="tint/7">
            <Text variant="meta" color="textDim">
              {t(stat.labelKey)}
            </Text>
            <Text variant="label" style={TABULAR}>
              {stat.value}
            </Text>
          </Box>
        ))}
      </Grid>
    </Box>
  );
}

/** A titled run of lines inside a drawer. */
export function PerfSection({
  titleKey,
  children,
}: Readonly<{ titleKey: MessageKey; children: ReactNode }>) {
  const t = useT();
  return (
    <Box mb={20}>
      <Text variant="overline" color="textDim" mb={8}>
        {t(titleKey)}
      </Text>
      {children}
    </Box>
  );
}

/** A drawer's signals, drawn only when there is one. */
export function PerfFlagSection({ flags }: Readonly<{ flags: readonly PerfFlag[] }>) {
  if (flags.length === 0) {
    return null;
  }
  return (
    <PerfSection titleKey="perf.colFlags">
      <PerfFlags flags={flags} />
    </PerfSection>
  );
}

/** One segment named in a drawer, a link to its own drawer, with a figure on
 *  the right. */
export function PerfSegmentLine({
  segment,
  figure,
}: Readonly<{ segment: PerfSegmentName; figure: string }>) {
  return (
    <PerfLink open={{ segment: segment.key }}>
      <Row gap={12} py={8} border="tint/7" align="flex-start">
        <Box flex={1} minW={0}>
          <Text variant="meta" font="mono" lines={3}>
            {segment.label}
          </Text>
          <Text variant="meta" color="textDim" lines={1}>
            {segment.origin ?? segment.kind}
          </Text>
        </Box>
        <Text variant="meta" style={TABULAR}>
          {figure}
        </Text>
      </Row>
    </PerfLink>
  );
}
