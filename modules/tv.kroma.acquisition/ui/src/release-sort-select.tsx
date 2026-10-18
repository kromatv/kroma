import { useT } from '@kromatv/module-sdk';
import { Select, Text } from '@kromatv/ui/kit';
import { RELEASE_SORTS, type ReleaseSort, releaseSortOf } from './release-sort';
import type { ReleaseView } from './use-release-view';

const SORT_LABEL: Record<ReleaseSort, string> = {
  score: 'requests.colScore',
  size: 'requests.colSize',
  seeders: 'acq.colSeeders',
  date: 'acq.sortDate',
};

export function ReleaseSortSelect({ view }: Readonly<{ view: ReleaseView }>) {
  const t = useT();
  return (
    <Select.Root
      value={view.sort}
      onValueChange={(next) => {
        const picked = releaseSortOf(next);
        if (picked) view.setSort(picked);
      }}
      label={t('requests.sortBy')}
    >
      <Select.Trigger size="sm">
        <Text variant="meta" color="textDim">
          {t('acq.sortLabel')}
        </Text>
        <Select.Value />
      </Select.Trigger>
      {RELEASE_SORTS.map((one) => (
        <Select.Item key={one} value={one} label={t(SORT_LABEL[one])} />
      ))}
    </Select.Root>
  );
}
