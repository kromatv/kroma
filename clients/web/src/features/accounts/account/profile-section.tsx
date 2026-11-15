import type { AccountPatch } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Box, Button, Field, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { SettingCard } from '#web/features/accounts/account/setting-card';
import { StatusText, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';

/** The name and the address this account goes by, saved together. */
export function ProfileSection() {
  const t = useT();
  const { user, client, updateUser } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const save = useSave();

  if (!user) {
    return null;
  }

  const name = username.trim();
  const address = email.trim();
  const dirty = name !== user.username || address !== user.email;
  const canSave = dirty && name.length > 0 && address.length > 0;

  const submit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!canSave) {
      return;
    }
    const patch: AccountPatch = {};
    if (name !== user.username) {
      patch.username = name;
    }
    if (address !== user.email) {
      patch.email = address;
    }
    void save.run(async () => {
      const { user: saved } = await client.accounts.update(patch);
      updateUser({ username: saved.username, email: saved.email });
      setUsername(saved.username);
      setEmail(saved.email);
    }, t('account.saveFailed'));
  };

  return (
    <form onSubmit={submit}>
      <SettingCard
        icon="user"
        title={t('account.sectionInfo')}
        description={t('account.profileInfoDesc')}
        footer={
          <>
            <Box flex minW={160}>
              {save.status === 'idle' || save.status === 'saving' ? (
                <Text variant="meta" color="textDim">
                  {t('account.profileInfoHint')}
                </Text>
              ) : (
                <StatusText status={save.status} error={save.error} />
              )}
            </Box>
            <Button
              size="sm"
              label={save.status === 'saving' ? t('common.saving') : t('common.save')}
              onPress={submit}
              loading={save.status === 'saving'}
              disabled={!canSave}
            />
          </>
        }
      >
        <Box row={{ base: false, md: true }} gap={18}>
          <Box flex>
            <Field.Root label={t('auth.username')}>
              <Field.Input
                icon="at"
                value={username}
                onValueChange={setUsername}
                autoComplete="nickname"
              />
            </Field.Root>
          </Box>
          <Box flex>
            <Field.Root label={t('auth.email')}>
              <Field.Input type="email" icon="mail" value={email} onValueChange={setEmail} />
            </Field.Root>
          </Box>
        </Box>
      </SettingCard>
    </form>
  );
}
