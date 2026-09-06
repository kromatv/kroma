import type { UserId } from '@kroma/client/accounts';
import type { AdminUser } from '@kroma/client/admin';
import { resolveImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Avatar } from '@kroma/ui/kit';
import { EVERYONE, type FilterOption } from '#web/features/admin/dashboard-filters';
import { useCap, usePoll } from '#web/features/admin/shell';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';

const POLL_MS = 60000;
// The well a Select row gives its media slot.
const MARK = 18;

/** The authenticated roster, empty for an admin without `users.manage`. The
 *  dashboard itself opens to any admin, so asking regardless would be three
 *  403s a minute rather than a panel that quietly does without the names. */
export function useAccountRoster(): AdminUser[] {
  const { client } = useAuth();
  const allowed = useCap('users.manage');
  const { data } = usePoll(
    ['admin', 'users', allowed],
    () => (allowed ? client.admin.users() : Promise.resolve(null)),
    POLL_MS,
  );
  return data?.users ?? [];
}

/** Whose plays a panel counts: one member, or everyone. */
export type AccountFilter = UserId | typeof EVERYONE;

export function useAccountOptions(): FilterOption<AccountFilter>[] {
  const t = useT();
  const roster = useAccountRoster();
  return [
    { value: EVERYONE, label: t('admin.everyMember') },
    ...roster.map((user) => ({
      value: user.id,
      label: user.username,
      media: (
        <Avatar
          name={user.username}
          src={resolveImageUrl(apiBase(), user.avatarUrl)}
          size={MARK}
          circle
        />
      ),
    })),
  ];
}
