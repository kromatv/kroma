import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Grid, StatCard, type StatCardValueProps } from '@kromatv/ui/kit';

export interface NetworkStat {
  labelKey: MessageKey;
  value: string | number;
  color?: StatCardValueProps['color'];
}

/** The totals above a network tab's table. */
export function NetworkStatGrid({ stats }: Readonly<{ stats: readonly NetworkStat[] }>) {
  const t = useT();
  return (
    <Grid min={180} gap={16}>
      {stats.map((stat) => (
        <StatCard.Root key={stat.labelKey}>
          <StatCard.Label>{t(stat.labelKey)}</StatCard.Label>
          <StatCard.Value color={stat.color ?? 'text'}>{stat.value}</StatCard.Value>
        </StatCard.Root>
      ))}
    </Grid>
  );
}
