import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { SegmentGroup } from '@kromatv/ui/kit';
import { SUMMARY_WINDOWS, type SummaryWindow } from '#web/features/admin/network-host-groups';

const WINDOW_LABEL: Record<SummaryWindow, MessageKey> = {
  1: 'network.window1',
  7: 'network.window7',
  30: 'network.window30',
};

interface WindowSelectProps {
  value: SummaryWindow;
  onValueChange: (next: SummaryWindow) => void;
}

/** The period a network tab sums over. */
export function WindowSelect({ value, onValueChange }: Readonly<WindowSelectProps>) {
  const t = useT();
  return (
    <SegmentGroup.Root
      label={t('network.window')}
      value={String(value)}
      onValueChange={(next) =>
        onValueChange(SUMMARY_WINDOWS.find((one) => String(one) === next) ?? 7)
      }
    >
      {SUMMARY_WINDOWS.map((one) => (
        <SegmentGroup.Item key={one} value={String(one)}>
          <SegmentGroup.Label>{t(WINDOW_LABEL[one])}</SegmentGroup.Label>
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}
