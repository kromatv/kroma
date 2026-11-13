import { apiErrorText } from '@kromatv/client';
import {
  DEFAULT_SIGN_IN_METHODS,
  type SignInButton,
  signInButtons,
} from '@kromatv/client/accounts';
import type { IdentityInfo } from '@kromatv/client/sso';
import { flowMessage } from '@kromatv/core';
import { useFormat, useT } from '@kromatv/ui';
import { Box, Button, IconWell, ListRow, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { takeOutcome } from '#web/shared/lib/sso-flow';
import { useAuthFlows } from '#web/shared/lib/use-auth-flows';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { ProviderMark } from '#web/shared/ui/provider-mark';

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
        <Box center w={38} h={38}>
          <ProviderMark icon={provider.icon} image={provider.image} size={26} />
        </Box>
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
  const flows = useAuthFlows();
  const { data: identities } = useQuery(webRuntime.queries.userQueries.identities());
  const { data: config } = useQuery(webRuntime.client.query.accounts.config());
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const outcome = takeOutcome('link');
    if (!outcome || outcome.result.status === 'linked') return null;
    return t(`sso.${flowMessage(outcome.result)}.body`, {
      provider: t('sso.yourProvider'),
      server: 'KROMA',
    });
  });

  const providers = signInButtons(config?.signIn ?? DEFAULT_SIGN_IN_METHODS);
  const linked = identities ?? [];
  if (providers.length === 0 && linked.length === 0) return null;

  const link = async (provider: SignInButton) => {
    setLinking(provider.id);
    setError(null);
    try {
      await flows.link(provider.id, { returnTo: '/account' });
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
