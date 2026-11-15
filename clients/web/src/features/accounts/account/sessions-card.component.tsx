import type { SessionId } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Button, IconWell, ListRow, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SessionRow } from '#web/features/accounts/account/session-row.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const SHOWN_AT_FIRST = 5;

/** Every device this account is signed in on: this one first, then the one
 * used most recently, with one action that signs all the others out. */
export function SessionsCard() {
  const webRuntime = useWebRuntime();
  const t = useT();
  const qc = useQueryClient();
  const { data: sessions, isPending } = useQuery(webRuntime.queries.userQueries.sessions());
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<SessionId | 'others' | null>(null);
  const [failed, setFailed] = useState(false);

  const list = sessions ?? [];
  const others = list.filter((session) => !session.current).length;
  const shown = all ? list : list.slice(0, SHOWN_AT_FIRST);

  const signOut = async (which: SessionId | 'others') => {
    setBusy(which);
    setFailed(false);
    try {
      if (which === 'others') {
        await webRuntime.client.accounts.revokeOtherSessions();
      } else {
        await webRuntime.client.accounts.revokeSession(which);
      }
      await qc.invalidateQueries({ queryKey: webRuntime.queries.userQueries.sessions().queryKey });
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ListRow.Group size="md">
      <ListRow.Root>
        <ListRow.Label>{t('account.devices')}</ListRow.Label>
        <ListRow.Hint>{t('account.devicesDesc')}</ListRow.Hint>
        <ListRow.Leading>
          <IconWell name="devices" size="sm" tone="accent" />
        </ListRow.Leading>
        {others > 0 ? (
          <ListRow.Trailing>
            <Button
              variant="dangerGhost"
              size="sm"
              label={t('account.signOutOthers')}
              onPress={() => void signOut('others')}
              loading={busy === 'others'}
            />
          </ListRow.Trailing>
        ) : null}
      </ListRow.Root>
      {failed ? (
        <ListRow.Root>
          <Text variant="meta" color="danger">
            {t('account.signOutOthersFailed')}
          </Text>
        </ListRow.Root>
      ) : null}
      {isPending ? (
        <ListRow.Root>
          <Text variant="meta" color="textMuted">
            {t('common.loading')}
          </Text>
        </ListRow.Root>
      ) : null}
      {shown.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          revoking={busy === session.id}
          onRevoke={() => void signOut(session.id)}
        />
      ))}
      {list.length > shown.length ? (
        <ListRow.Root onPress={() => setAll(true)} chevron={false}>
          <ListRow.Label>{t('account.sessionsShowAll', { count: list.length })}</ListRow.Label>
        </ListRow.Root>
      ) : null}
    </ListRow.Group>
  );
}
