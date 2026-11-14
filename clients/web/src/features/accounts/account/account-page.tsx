import type { AccountPatch } from '@kromatv/client/accounts';
import { prefValue } from '@kromatv/core/react';
import { useT } from '@kromatv/ui';
import { Box, Button, EmptyState, Field, PageHeader, Section, Surface } from '@kromatv/ui/kit';
import { useState } from 'react';
import { NotificationsCard } from '#web/features/accounts/account/notifications-card';
import { IdentitiesCard } from '#web/features/accounts/account/identities-card';
import { PasskeysCard } from '#web/features/accounts/account/passkeys-card';
import { PinCard } from '#web/features/accounts/account/pin-card';
import { NONE, PreferencesCard } from '#web/features/accounts/account/preferences-card';
import { PhotoCard } from '#web/features/accounts/account/profile-card';
import { SecurityCard } from '#web/features/accounts/account/security-card';
import { SessionsCard } from '#web/features/accounts/account/sessions-card';
import { useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';
import { PageFrame } from '#web/shared/ui';
import { SaveDock } from '#web/shared/ui/save-dock';

export function AccountPage() {
  const t = useT();
  const { user } = useAuth();

  if (!user) {
    return (
      <PageFrame>
        <EmptyState.Root icon="user-off">
          <EmptyState.Title>{t('account.signedOut')}</EmptyState.Title>
        </EmptyState.Root>
      </PageFrame>
    );
  }

  // Keyed by account id so switching profiles remounts the editor and re-seeds it.
  return <ProfileEditor key={user.id} />;
}

function ProfileEditor() {
  const t = useT();
  const { user, client, updateUser, logout } = useAuth();

  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  // The server lower-cases a playback language (`fr-ca`) while the picker's
  // option is `fr-CA`; `prefValue` normalizes so a raw seed still matches.
  const [audio, setAudio] = useState(prefValue(user?.audioLanguage ?? null));
  const [subtitle, setSubtitle] = useState(prefValue(user?.subtitleLanguage ?? null));
  const save = useSave();

  if (!user) return null;

  const trimmedName = username.trim();
  const trimmedEmail = email.trim();
  const dirty =
    trimmedName !== user.username ||
    trimmedEmail !== user.email ||
    audio !== prefValue(user.audioLanguage ?? null) ||
    subtitle !== prefValue(user.subtitleLanguage ?? null);
  const canSave = dirty && trimmedName.length > 0 && trimmedEmail.length > 0;

  const reset = () => {
    setUsername(user.username);
    setEmail(user.email);
    setAudio(prefValue(user.audioLanguage ?? null));
    setSubtitle(prefValue(user.subtitleLanguage ?? null));
  };

  const saveProfile = () => {
    if (!canSave) return;
    const patch: AccountPatch = {};
    if (trimmedName !== user.username) patch.username = trimmedName;
    if (trimmedEmail !== user.email) patch.email = trimmedEmail;
    if (audio !== prefValue(user.audioLanguage ?? null))
      patch.audioLanguage = audio === NONE ? null : audio;
    if (subtitle !== prefValue(user.subtitleLanguage ?? null))
      patch.subtitleLanguage = subtitle === NONE ? null : subtitle;

    save.run(async () => {
      const { user: u } = await client.accounts.update(patch);
      updateUser({
        username: u.username,
        email: u.email,
        audioLanguage: u.audioLanguage ?? null,
        subtitleLanguage: u.subtitleLanguage ?? null,
      });
      // Mirror the server's normalisation back so the form settles to clean.
      setUsername(u.username);
      setEmail(u.email);
      setAudio(prefValue(u.audioLanguage ?? null));
      setSubtitle(prefValue(u.subtitleLanguage ?? null));
    }, t('account.saveFailed'));
  };

  return (
    <PageFrame>
      <PageHeader.Root>
        <PageHeader.Title>{t('account.title')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('account.subtitle')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <Button
            variant="ghost"
            size="sm"
            icon="logout"
            label={t('auth.logout')}
            onPress={() => void logout()}
          />
        </PageHeader.Actions>
      </PageHeader.Root>

      <Box gap={28} mt={24}>
        <Section.Root>
          <Section.Header>
            <Section.Title>{t('account.sectionPhoto')}</Section.Title>
          </Section.Header>
          <PhotoCard />
        </Section.Root>

        <Section.Root>
          <Section.Header>
            <Section.Title>{t('account.sectionInfo')}</Section.Title>
          </Section.Header>
          <Surface elevated pad="none" p={22} radius="xl" border="border" gap={18}>
            <Box maxW={{ base: '100%', md: '50%' }}>
              <Field.Root label={t('auth.username')}>
                <Field.Input
                  icon="at"
                  value={username}
                  onValueChange={setUsername}
                  autoComplete="nickname"
                />
              </Field.Root>
            </Box>
            <Field.Root label={t('auth.email')}>
              <Field.Input type="email" icon="mail" value={email} onValueChange={setEmail} />
            </Field.Root>
          </Surface>
        </Section.Root>

        <Section.Root>
          <Section.Header>
            <Section.Title>{t('account.sectionPrefs')}</Section.Title>
          </Section.Header>
          <PreferencesCard
            audio={audio}
            subtitle={subtitle}
            onAudio={setAudio}
            onSubtitle={setSubtitle}
          />
        </Section.Root>

        <Section.Root>
          <Section.Header>
            <Section.Title>{t('account.sectionNotifications')}</Section.Title>
          </Section.Header>
          <NotificationsCard />
        </Section.Root>

        <Section.Root>
          <Section.Header>
            <Section.Title>{t('account.sectionSecurity')}</Section.Title>
          </Section.Header>
          <SecurityCard />
          <PinCard />
          <PasskeysCard />
          <IdentitiesCard />
          <SessionsCard />
        </Section.Root>
      </Box>

      <SaveDock
        dirty={dirty}
        status={save.status}
        error={save.error}
        savedLabel={t('account.profileSaved')}
        canSave={canSave}
        onCancel={reset}
        onSave={saveProfile}
      />
    </PageFrame>
  );
}
