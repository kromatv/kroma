import type { AdminUser, HistoryLibrary } from '@kroma/client/admin';
import { resolveImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Avatar, Chip, Row, Select } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import {
  EVERY_WINDOW,
  HISTORY_RANGES,
  type HistorySearch,
  isHistoryRange,
} from '#web/features/admin/history-query';
import { apiBase } from '#web/shared/lib/api';

const ANY_ID = 'all';
// The well a Select row gives its media slot.
const MARK = 18;

interface IdFilterProps<Id extends string> {
  label: string;
  anyLabel: string;
  value: Id | undefined;
  options: readonly { id: Id; name: string; media?: ReactNode }[];
  onPick: (value: Id | undefined) => void;
}

function IdFilter<Id extends string>({
  label,
  anyLabel,
  value,
  options,
  onPick,
}: Readonly<IdFilterProps<Id>>) {
  const pick = (next: string) => {
    if (next === ANY_ID) {
      onPick(undefined);
      return;
    }
    const picked = options.find((option) => option.id === next);
    if (picked) onPick(picked.id);
  };
  return (
    <Select.Root label={label} value={value ?? ANY_ID} onValueChange={pick}>
      <Select.Trigger />
      <Select.Item value={ANY_ID} label={anyLabel} />
      {options.map((option) => (
        <Select.Item key={option.id} value={option.id} label={option.name}>
          {option.media ? <Select.Media>{option.media}</Select.Media> : null}
        </Select.Item>
      ))}
    </Select.Root>
  );
}

interface HistoryFiltersProps {
  search: HistorySearch;
  libraries: readonly HistoryLibrary[];
  users: readonly AdminUser[];
  pinnedTitle: string | null;
  onSearchChange: (next: HistorySearch) => void;
}

export function HistoryFilters({
  search,
  libraries,
  users,
  pinnedTitle,
  onSearchChange,
}: Readonly<HistoryFiltersProps>) {
  const t = useT();
  const narrow = (patch: Partial<HistorySearch>) =>
    onSearchChange({ ...search, ...patch, page: 1 });
  const pickRange = (value: string) =>
    narrow({ range: value !== EVERY_WINDOW && isHistoryRange(value) ? value : undefined });

  return (
    <Row gap={10} wrap>
      {search.item ? (
        <Chip
          active
          icon="x"
          label={pinnedTitle ?? t('admin.colTitle')}
          onPress={() => narrow({ item: undefined })}
        />
      ) : null}

      <IdFilter
        label={t('admin.allLibrariesFilter')}
        anyLabel={t('admin.allLibrariesFilter')}
        value={search.library}
        options={libraries}
        onPick={(library) => narrow({ library })}
      />

      <IdFilter
        label={t('admin.colUser')}
        anyLabel={t('admin.everyMember')}
        value={search.user}
        options={users.map((user) => ({
          id: user.id,
          name: user.username,
          media: (
            <Avatar
              name={user.username}
              src={resolveImageUrl(apiBase(), user.avatarUrl)}
              size={MARK}
              circle
            />
          ),
        }))}
        onPick={(user) => narrow({ user })}
      />

      <Select.Root
        label={t('admin.colWhen')}
        value={search.range ?? EVERY_WINDOW}
        onValueChange={pickRange}
      >
        <Select.Trigger />
        {HISTORY_RANGES.map((option) => (
          <Select.Item key={option.value} value={option.value} label={t(option.labelKey)} />
        ))}
      </Select.Root>
    </Row>
  );
}
