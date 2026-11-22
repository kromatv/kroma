import type { AdminUser } from '@kromatv/client/admin';
import { useT } from '@kromatv/ui';
import { KidsMark } from '@kromatv/ui/kit';
import { Pill } from '#web/features/admin/pill.component';

/** What a member row says beside the name: a Kids profile's mark, and a reset
 * the person asked for from the sign-in screen. */
export function MemberMarks({ user }: Readonly<{ user: AdminUser }>) {
  const t = useT();
  return (
    <>
      {user.kids ? <KidsMark /> : null}
      {user.resetRequested ? (
        <Pill ink="accentText" bg="accentWash/16">
          {t('admin.resetRequested')}
        </Pill>
      ) : null}
    </>
  );
}
