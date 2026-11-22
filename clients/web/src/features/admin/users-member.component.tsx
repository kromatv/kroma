import type { AdminUser, InvitationState } from '@kromatv/client/admin';
import { resolveImageUrl } from '@kromatv/core';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Avatar, Box, type ColorValue, Text } from '@kromatv/ui/kit';
import { MemberMarks } from '#web/features/admin/member-marks.component';
import { Pill } from '#web/features/admin/pill.component';
import { apiBase } from '#web/shared/lib/api';

const INVITATION: Record<InvitationState, { label: MessageKey; ink: ColorValue; bg: ColorValue }> =
  {
    pending: { label: 'admin.invitationPending', ink: 'accentText', bg: 'accentSoft' },
    expired: { label: 'admin.invitationExpired', ink: 'danger', bg: 'danger/13' },
    none: { label: 'admin.invitationNone', ink: 'textMuted', bg: 'tint/6' },
  };

function InvitationPill({ state }: Readonly<{ state: InvitationState }>) {
  const t = useT();
  const { label, ink, bg } = INVITATION[state];
  return (
    <Pill ink={ink} bg={bg}>
      {t(label)}
    </Pill>
  );
}

/** Who a row of the member table is: avatar, name, address, whether they asked
 * for a reset, and where the invitation of an account that waits stands. */
export function MemberIdentity({ user }: Readonly<{ user: AdminUser }>) {
  const t = useT();
  return (
    <>
      <Avatar
        name={user.username}
        src={resolveImageUrl(apiBase(), user.avatarUrl)}
        size={42}
        circle
      />
      <Box minW={0} flex={1}>
        <Box row align="center" gap={8} wrap>
          <Text variant="label" lines={1}>
            {user.username}
          </Text>
          <MemberMarks user={user} />
          {user.invitation ? <InvitationPill state={user.invitation} /> : null}
        </Box>
        <Text variant="meta" color="textDim" lines={1}>
          {user.email ?? t('admin.waitingNoAddress')}
        </Text>
      </Box>
    </>
  );
}
