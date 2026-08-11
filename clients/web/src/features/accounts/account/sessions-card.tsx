import type { SessionInfo } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Badge, Box, Button, Icon, type IconName, ListRow, Row, Text } from '@kroma/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { relativeSeen } from '#web/shared/lib/adminFormat';
import { kromaClient } from '#web/shared/lib/api';
import { type DeviceKind, deviceInfo } from '#web/shared/lib/device';
import { userQueries } from '#web/shared/lib/queries';

const DEVICE_ICON: Record<DeviceKind, IconName> = {
  tv: 'device-tv',
  mobile: 'device-mobile',
  desktop: 'device-desktop',
};

function SessionRow({ session }: Readonly<{ session: SessionInfo }>) {
  const t = useT();
  const qc = useQueryClient();
  const [revoking, setRevoking] = useState(false);
  const { label, kind } = deviceInfo(session.userAgent, t('account.unknownDevice'));

  const revoke = async () => {
    setRevoking(true);
    try {
      await kromaClient().revokeSession(session.id);
      await qc.invalidateQueries({ queryKey: ['sessions'] });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <ListRow.Root>
      <ListRow.Leading>
        <Box center w={38} h={38} radius="xs" border="border" bg="surface2">
          <Icon name={DEVICE_ICON[kind]} size={19} stroke={1.7} color="textMuted" />
        </Box>
      </ListRow.Leading>
      <Row gap={10}>
        <ListRow.Label>{label}</ListRow.Label>
        {session.current ? <Badge tone="success">{t('account.thisDevice')}</Badge> : null}
      </Row>
      <ListRow.Hint>{relativeSeen(session.lastSeen)}</ListRow.Hint>
      <ListRow.Trailing>
        {session.current ? (
          <Text variant="meta" color="textDim">
            {t('account.sessionActive')}
          </Text>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            label={revoking ? t('common.saving') : t('account.signOutDevice')}
            onPress={revoke}
            loading={revoking}
          />
        )}
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

export function SessionsCard() {
  const t = useT();
  const { data: sessions, isPending } = useQuery(userQueries.sessions());
  const note = isPending ? t('common.loading') : sessionsNote(sessions, t);

  return (
    <ListRow.Group size="md">
      <ListRow.Root label={t('account.sessions')} />
      {note ? (
        <ListRow.Root>
          <Text variant="meta" color="textMuted">
            {note}
          </Text>
        </ListRow.Root>
      ) : null}
      {(sessions ?? []).map((s) => (
        <SessionRow key={s.id} session={s} />
      ))}
    </ListRow.Group>
  );
}

function sessionsNote(
  sessions: SessionInfo[] | undefined,
  t: ReturnType<typeof useT>,
): string | null {
  return !sessions || sessions.length === 0 ? t('account.sessionsEmpty') : null;
}
