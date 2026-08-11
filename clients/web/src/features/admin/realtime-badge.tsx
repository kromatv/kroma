// The "live" chip a realtime console page pins beside its title, passed to
// <PageHeader.Root actions={...}>.

import { useT } from '@kroma/ui';

export function RealtimeBadge() {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-full border border-border bg-surface-1 px-4 py-2">
      <span className="h-1.75 w-1.75 animate-[kroma-breathe_2s_ease-in-out_infinite] rounded-full bg-accent" />
      <span className="text-[13px] font-semibold text-text/70">{t('admin.realtimeActivity')}</span>
    </div>
  );
}
