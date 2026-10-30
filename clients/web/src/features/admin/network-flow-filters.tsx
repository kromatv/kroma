import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Button, Field, Row, SegmentGroup, Select, Spacer } from '@kromatv/ui/kit';
import type { FlowFilters, VerdictFilter } from '#web/features/admin/network-flows';

const ANY = '*';

const VERDICTS: readonly { value: VerdictFilter; labelKey: MessageKey }[] = [
  { value: 'all', labelKey: 'network.verdictAll' },
  { value: 'allowed', labelKey: 'network.verdictAllowed' },
  { value: 'blocked', labelKey: 'network.verdictBlocked' },
];

interface FlowFiltersBarProps {
  filters: FlowFilters;
  onFiltersChange: (next: FlowFilters) => void;
  callers: readonly string[];
  purposes: readonly string[];
  callerName: (caller: string) => string;
  live: boolean;
  onLiveChange: (live: boolean) => void;
}

export function FlowFiltersBar({
  filters,
  onFiltersChange,
  callers,
  purposes,
  callerName,
  live,
  onLiveChange,
}: Readonly<FlowFiltersBarProps>) {
  const t = useT();
  const narrow = (patch: Partial<FlowFilters>) => onFiltersChange({ ...filters, ...patch });
  const picked = (value: string) => (value === ANY ? null : value);

  return (
    <Row wrap gap={12} mb={16}>
      <Select.Root
        label={t('network.colCaller')}
        value={filters.caller ?? ANY}
        onValueChange={(value) => narrow({ caller: picked(value), purpose: null })}
      >
        <Select.Trigger />
        <Select.Item value={ANY} label={t('network.anyCaller')} />
        {callers.map((caller) => (
          <Select.Item key={caller} value={caller} label={callerName(caller)} />
        ))}
      </Select.Root>
      <Select.Root
        label={t('network.colPurpose')}
        value={filters.purpose ?? ANY}
        onValueChange={(value) => narrow({ purpose: picked(value) })}
      >
        <Select.Trigger />
        <Select.Item value={ANY} label={t('network.anyPurpose')} />
        {purposes.map((purpose) => (
          <Select.Item key={purpose} value={purpose} label={purpose} />
        ))}
      </Select.Root>
      <SegmentGroup.Root<VerdictFilter>
        label={t('network.verdictLabel')}
        value={filters.verdict}
        onValueChange={(verdict) => narrow({ verdict })}
      >
        {VERDICTS.map((verdict) => (
          <SegmentGroup.Item key={verdict.value} value={verdict.value}>
            <SegmentGroup.Label>{t(verdict.labelKey)}</SegmentGroup.Label>
          </SegmentGroup.Item>
        ))}
      </SegmentGroup.Root>
      <Field.Root w={240} label={t('network.searchHost')} hideLabel>
        <Field.Input
          type="search"
          icon="search"
          placeholder={t('network.searchHost')}
          value={filters.host}
          onValueChange={(host) => narrow({ host })}
        />
      </Field.Root>
      <Spacer />
      <Button
        variant="outline"
        icon={live ? 'player-pause' : 'player-play'}
        label={live ? t('network.pause') : t('network.resume')}
        onPress={() => onLiveChange(!live)}
      />
    </Row>
  );
}
