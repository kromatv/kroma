import { apiErrorText } from '@kromatv/client';
import type { SignInButton } from '@kromatv/client/accounts';
import type { IdentityInfo } from '@kromatv/client/sso';
import { useFormat, useT } from '@kromatv/ui';
import { Button, hasGlyph, IconWell, ListRow, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ssoMessage } from '#web/features/accounts/sso-message';
import { takeOutcome } from '#web/shared/lib/sso-flow';
import { useProviderFlow } from '#web/shared/lib/use-provider-flow';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

function IdentityRow({
  identity,
  onRemoved,
  onFailed,
}: Readonly<{
  identity: IdentityInfo;
  onRemoved: () => void;
  onFailed: (message: string) => void;
}>) {
  const webRuntime = useWebRuntime();
  const t = useT();
  const fmt = useFormat();
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    setRemoving(true);
    try {
      await webRuntime.client.sso.unlink(identity.id);
      onRemoved();
    } catch (e) {
      onFailed(apiErrorText(e, t('account.identityUnlinkFailed')));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <ListRow.Root>
      <ListRow.Label>{identity.provider}</ListRow.Label>
      <ListRow.Hint>
        {identity.name}
        {' · '}
        {identity.lastUsed ? fmt.elapsed(identity.lastUsed) : t('account.identityNeverUsed')}
      </ListRow.Hint>
      <ListRow.Leading>
        <IconWell name="link" size="sm" tone="success" />
      </ListRow.Leading>
      <ListRow.Trailing>
        <Button variant="ghost" size="sm" onPress={remove} loading={removing}>
          <Text variant="meta" color="danger">
            {removing ? t('common.saving') : t('account.identityUnlink')}
          </Text>
        </Button>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function ProviderRow({
  provider,
  busy,
  onLink,
}: Readonly<{ provider: SignInButton; busy: boolean; onLink: () => void }>) {
  const t = useT();
  return (
    <ListRow.Root>
      <ListRow.Label>{provider.label}</ListRow.Label>
      <ListRow.Hint>{t('account.identityNotLinked')}</ListRow.Hint>
      <ListRow.Leading>
        <IconWell name={hasGlyph(provider.icon) ? provider.icon : 'key'} size="sm" tone="neutral" />
      </ListRow.Leading>
      <ListRow.Trailing>
        <Button
          size="sm"
          icon="link"
          label={t('account.identityLink')}
          onPress={onLink}
          loading={busy}
        />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

/** The providers this account signs in through, and the ones it could. Drawn
 * only on a server that has a provider, or for an account that still holds an
 * identity from one it no longer has. */
export function IdentitiesCard() {
  const webRuntime = useWebRuntime();
  const t = useT();
  const qc = useQueryClient();
  const startFlow = useProviderFlow();
  const { data: identities } = useQuery(webRuntime.queries.userQueries.identities());
  const { data: config } = useQuery(webRuntime.client.query.accounts.config());
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const outcome = takeOutcome('link');
    if (!outcome || outcome.result.status === 'linked') return null;
    return t(`sso.${ssoMessage(outcome.result)}.body`, {
      provider: t('sso.yourProvider'),
      server: 'KROMA',
    });
  });

  const providers = config?.signIn?.providers ?? [];
  const linked = identities ?? [];
  if (providers.length === 0 && linked.length === 0) return null;

  const link = async (provider: SignInButton) => {
    setLinking(provider.id);
    setError(null);
    try {
      await startFlow('link', provider.id, { returnTo: '/account' });
    } catch (e) {
      setError(apiErrorText(e, t('account.identityLinkFailed', { provider: provider.label })));
      setLinking(null);
    }
  };

  return (
    <ListRow.Group size="md">
      <ListRow.Root>
        <ListRow.Label>{t('account.identities')}</ListRow.Label>
        <ListRow.Hint>{t('account.identitiesDesc')}</ListRow.Hint>
        <ListRow.Leading>
          <IconWell name="id" size="sm" tone="accent" />
        </ListRow.Leading>
      </ListRow.Root>
      {error ? (
        <ListRow.Root>
          <Text variant="meta" color="danger">
            {error}
          </Text>
        </ListRow.Root>
      ) : null}
      {linked.map((identity) => (
        <IdentityRow
          key={identity.id}
          identity={identity}
          onFailed={setError}
          onRemoved={() => {
            setError(null);
            void qc.invalidateQueries({
              queryKey: webRuntime.queries.userQueries.identities().queryKey,
            });
          }}
        />
      ))}
      {providers
        .filter((provider) => !linked.some((identity) => identity.provider === provider.label))
        .map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            busy={linking === provider.id}
            onLink={() => void link(provider)}
          />
        ))}
    </ListRow.Group>
  );
}
