import { normalizeServerUrl as norm, type StoredSession } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import {
  Avatar,
  Box,
  Drawer,
  FocusColumn,
  type FocusNavHandlers,
  ListRow,
  Text,
} from '@kromatv/ui/kit';
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { makeClient } from '#tv/app/apiClient';
import { useAuth } from '#tv/app/providers/auth';
import { artUrl } from '#tv/shared/ui';

function ProfileMenu({
  account,
  open,
  onClose,
}: Readonly<{ account: StoredSession; open: boolean; onClose: () => void }>) {
  const t = useT();
  const { forget } = useAuth();

  const signOut = () => {
    onClose();
    if (account.serverUrl) {
      void makeClient(account.serverUrl)
        .accounts.logout(account.accessToken)
        .catch(() => undefined);
    }
    forget(account.user.id, account.serverUrl);
  };

  return (
    <Drawer.Root open={open} onClose={onClose} title={account.user.username} width="md" floating>
      <Drawer.Header>
        <Box row align="center" gap={20}>
          <Avatar
            name={account.user.username}
            seed={account.user.id}
            size={72}
            roundness={0.27}
            src={artUrl(norm(account.serverUrl), account.user.avatarUrl)}
          />
          <Box flex gap={4}>
            <Text variant="headingTv" lines={1}>
              {account.user.username}
            </Text>
            <Text variant="label" color="textDim">
              {t('settings.signOutDesc')}
            </Text>
          </Box>
        </Box>
      </Drawer.Header>
      <Drawer.Panel>
        <FocusColumn>
          <ListRow.Root
            icon="logout"
            size="tv"
            ground="surface"
            chevron={false}
            autoFocus
            onPress={signOut}
          >
            <ListRow.Label>{t('auth.logout')}</ListRow.Label>
          </ListRow.Root>
        </FocusColumn>
      </Drawer.Panel>
    </Drawer.Root>
  );
}

/** The sheet a held OK slides in over a profile on the picker, to sign it out of
 * this television. Same contract as the title sheet: `open` goes to the tile's
 * `onLongPress`, and the returned `onBack` closes the sheet before the screen. */
export function useProfileMenu(onBack: FocusNavHandlers['onBack']): {
  open: (account: StoredSession) => void;
  onBack: NonNullable<FocusNavHandlers['onBack']>;
  menu: ReactNode;
} {
  const [held, setHeld] = useState<{ account: StoredSession; open: boolean } | null>(null);
  const shown = useRef(false);
  useLayoutEffect(() => {
    shown.current = held?.open === true;
  });
  const open = useCallback((account: StoredSession) => setHeld({ account, open: true }), []);
  const close = useCallback(() => setHeld((cur) => (cur ? { ...cur, open: false } : cur)), []);
  const back = useCallback(() => (shown.current ? false : onBack?.()), [onBack]);
  const menu = held ? (
    <ProfileMenu account={held.account} open={held.open} onClose={close} />
  ) : null;
  return { open, onBack: back, menu };
}
