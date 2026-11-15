import type { JoinRequest } from '@kromatv/client/sso';
import { useFormat, useT } from '@kromatv/ui';
import { Box, Button, Disclosure, IconWell, ListRow, Section } from '@kromatv/ui/kit';
import { useState } from 'react';
import { usePoll } from '#web/features/admin/shell';
import { ApproveJoinModal } from '#web/features/admin/users-approve-modal';
import { useAuth } from '#web/shared/lib/auth';

function who(request: JoinRequest): string {
  return request.name ? `${request.name} · ${request.email}` : request.email;
}

function WaitingRow({
  request,
  onApproved,
  onChange,
}: Readonly<{ request: JoinRequest; onApproved: () => void; onChange: () => void }>) {
  const t = useT();
  const fmt = useFormat();
  const { client } = useAuth();
  const [declining, setDeclining] = useState(false);

  const approve = async () => {
    if (await ApproveJoinModal.call({ request })) onApproved();
  };
  const decline = async () => {
    setDeclining(true);
    try {
      await client.sso.decline(request.id);
    } finally {
      setDeclining(false);
      onChange();
    }
  };

  return (
    <ListRow.Root size="md">
      <ListRow.Label>{who(request)}</ListRow.Label>
      <ListRow.Hint>
        {t('admin.joinRequestedVia', {
          provider: request.provider,
          when: fmt.elapsed(new Date(request.createdAt * 1000).toISOString()),
        })}
      </ListRow.Hint>
      <ListRow.Leading>
        <IconWell name="user-plus" size="sm" tone="accent" />
      </ListRow.Leading>
      <ListRow.Trailing>
        <Button
          size="sm"
          icon="check"
          label={t('admin.joinApprove')}
          onPress={() => void approve()}
        />
        <Button
          variant="danger"
          size="sm"
          label={t('admin.joinDecline')}
          onPress={() => void decline()}
          loading={declining}
        />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function DeclinedRow({
  request,
  onChange,
}: Readonly<{ request: JoinRequest; onChange: () => void }>) {
  const t = useT();
  const { client } = useAuth();
  return (
    <ListRow.Root size="md">
      <ListRow.Label>{who(request)}</ListRow.Label>
      <ListRow.Hint>{request.provider}</ListRow.Hint>
      <ListRow.Leading>
        <IconWell name="user-off" size="sm" tone="neutral" />
      </ListRow.Leading>
      <ListRow.Trailing>
        <Button
          variant="glass"
          size="sm"
          label={t('admin.joinAllowAgain')}
          onPress={() => void client.sso.forget(request.id).then(onChange, onChange)}
        />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

/** The people a sign-in provider vouched for who are waiting to be let in,
 * and the ones that were declined. Drawn only while there is someone in
 * either list. */
export function JoinRequests({ onApproved }: Readonly<{ onApproved: () => void }>) {
  const t = useT();
  const { client } = useAuth();
  const { data, reload } = usePoll(
    ['admin', 'join-requests'],
    () => client.sso.joinRequests(),
    15000,
  );
  const waiting = data?.waiting ?? [];
  const declined = data?.declined ?? [];
  if (waiting.length === 0 && declined.length === 0) return null;

  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('admin.joinRequests')}</Section.Title>
      </Section.Header>
      <Box gap={12}>
        {waiting.map((request) => (
          <WaitingRow
            key={request.id}
            request={request}
            onChange={() => void reload()}
            onApproved={() => {
              void reload();
              onApproved();
            }}
          />
        ))}
        {declined.length > 0 ? (
          <Disclosure.Root>
            <Disclosure.Trigger>
              {t('admin.joinDeclined', { count: declined.length })}
            </Disclosure.Trigger>
            <Disclosure.Panel>
              <Box gap={12}>
                {declined.map((request) => (
                  <DeclinedRow key={request.id} request={request} onChange={() => void reload()} />
                ))}
              </Box>
            </Disclosure.Panel>
          </Disclosure.Root>
        ) : null}
      </Box>
    </Section.Root>
  );
}
