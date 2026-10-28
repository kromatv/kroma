import { useT } from '@kromatv/ui';
import { Avatar, Box, Icon, Text, useFocusNav } from '@kromatv/ui/kit';
import { useMemo } from 'react';
import { makeClient } from '#tv/app/apiClient';
import { isTokenRevoked, useAuth } from '#tv/app/providers/auth';
import { useNav, useParams } from '#tv/app/router';
import { AuthScreen, artUrl } from '#tv/shared/ui';
import { PinEntry } from './PinEntry';

/** Unlocks a remembered profile behind its PIN (route `pin`), against the account's own server. */
export function TvPin() {
  const nav = useNav();
  const t = useT();
  const { account } = useParams('pin');
  const { activate, forget } = useAuth();
  const client = useMemo(
    () => (account.serverUrl ? makeClient(account.serverUrl) : null),
    [account],
  );

  useFocusNav({ onBack: nav.back });

  const verify = async (pin: string): Promise<undefined> => {
    if (!client) return;
    const sess = await client.accounts
      .exchangeToken(account.accessToken, pin)
      .catch((e: unknown) => {
        if (!isTokenRevoked(e)) throw e;
        forget(account.user.id, account.serverUrl);
        nav.replace('addProfile');
        return null;
      });
    if (!sess) return;
    client.setAuthToken(sess.token);
    await client.accounts.verifyPin(pin);
    activate(account);
    nav.home();
  };

  return (
    <AuthScreen>
      <Avatar
        name={account.user.username}
        seed={account.user.id}
        size={118}
        roundness={0.25}
        src={artUrl(account.serverUrl ?? '', account.user.avatarUrl)}
      />
      <Text variant="headingTv" mt={24} mb={4}>
        {account.user.username}
      </Text>
      <Box row align="center" gap={8}>
        <Icon name="lock" size={14} color="accentText" />
        <Text variant="label" color="textDim">
          {t('pin.verifySubtitle')}
        </Text>
      </Box>

      <PinEntry label={t('pin.verifySubtitle')} onSubmit={verify} wrongKey="auth.pinIncorrect" />

      <Text variant="meta" mt={28} color="text/38">
        {t('pin.backHint')}
      </Text>
    </AuthScreen>
  );
}
