import { hasPermission } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Button, Callout, Text } from '@kromatv/ui/kit';
import { useAuth } from '#web/shared/lib/auth';
import { type RelayAsk, useRelayAsk } from '#web/shared/lib/use-relay-ask.hook';

function Asked({ ask }: Readonly<{ ask: RelayAsk }>) {
  const t = useT();
  if (ask.kind === 'failed') {
    return (
      <Text variant="meta" color="danger">
        {ask.reason}
      </Text>
    );
  }
  return (
    <Text variant="meta" color="textMuted">
      {ask.kind === 'asked'
        ? t('admin.invitationMailAsked', { email: ask.to })
        : t('admin.invitationMailAllowed')}
    </Text>
  );
}

/** Nothing left because the kroma.tv relay waits for the owner to allow this
 * server. Someone who holds the server's settings asks for the relay's
 * question at their own address; anyone else is told who can. */
export function RelayAllow() {
  const t = useT();
  const { user } = useAuth();
  const { asking, ask, run } = useRelayAsk();
  if (!user || !hasPermission(user, 'settings.manage')) {
    return (
      <Callout.Root tone="neutral" size="sm">
        <Callout.Detail>{t('admin.invitationMailInactiveOwner')}</Callout.Detail>
      </Callout.Root>
    );
  }
  return (
    <Callout.Root tone="accent" size="sm">
      <Callout.Title>{t('admin.invitationMailInactiveTitle')}</Callout.Title>
      <Callout.Detail>{t('admin.invitationMailInactive', { email: user.email })}</Callout.Detail>
      <Callout.Actions>
        <Button
          variant="glass"
          size="sm"
          icon="mail"
          label={t('admin.invitationMailAllow')}
          loading={asking}
          onPress={() => void run()}
        />
      </Callout.Actions>
      {ask ? <Asked ask={ask} /> : null}
    </Callout.Root>
  );
}
