import type { AccountPatch } from '@kroma/core';
import { prefValue } from '@kroma/core/react';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  color,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  Row,
  Section,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { type CSSProperties, useState } from 'react';
import { NotificationsCard } from '#web/features/accounts/account/notifications-card';
import { PasskeysCard } from '#web/features/accounts/account/passkeys-card';
import { PinCard } from '#web/features/accounts/account/pin-card';
import { NONE, PreferencesCard } from '#web/features/accounts/account/preferences-card';
import { PhotoCard } from '#web/features/accounts/account/profile-card';
import { SecurityCard } from '#web/features/accounts/account/security-card';
import { SessionsCard } from '#web/features/accounts/account/sessions-card';
import { useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';
import { PAGE_MAIN } from '#web/shared/ui';

export function AccountPage() {
  const t = useT();
  const { user } = useAuth();

  if (!user) {
    return (
      <main className={PAGE_MAIN}>
        <EmptyState.Root icon="user-off" title={t('account.signedOut')} />
      </main>
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
      const { user: u } = await client.updateAccount(patch);
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
    <main className={PAGE_MAIN}>
      <PageHeader.Root
        title={t('account.title')}
        subtitle={t('account.subtitle')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon="logout"
            label={t('auth.logout')}
            onPress={() => void logout()}
          />
        }
      />

      <Box gap={28} mt={24}>
        <Section.Root title={t('account.sectionPhoto')}>
          <PhotoCard />
        </Section.Root>

        <Section.Root title={t('account.sectionInfo')}>
          <Surface elevated pad="none" p={22} radius="lg" border="border" gap={18}>
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

        <Section.Root title={t('account.sectionPrefs')}>
          <PreferencesCard
            audio={audio}
            subtitle={subtitle}
            onAudio={setAudio}
            onSubtitle={setSubtitle}
          />
        </Section.Root>

        <Section.Root title={t('account.sectionNotifications')}>
          <NotificationsCard />
        </Section.Root>

        <Section.Root title={t('account.sectionSecurity')}>
          <SecurityCard />
          <PinCard />
          <PasskeysCard />
          <SessionsCard />
        </Section.Root>
      </Box>

      {/* Plain CSS: neither `position: sticky` nor a gradient has a React Native
          spelling, so the kit's vocabulary cannot carry this frame. */}
      <div style={dockStyle()}>
        {dirty || save.status !== 'idle' ? (
          <Row
            between
            gap={16}
            radius="sm"
            border="borderStrong"
            bg="surface2"
            shadow="pop"
            py={12}
            pl={20}
            pr={12}
          >
            <Row minW={0} gap={10}>
              <SaveStatusLabel dirty={dirty} status={save.status} error={save.error} />
            </Row>
            <Row shrink={0} gap={10}>
              <Button
                variant="glass"
                size="sm"
                label={t('common.cancel')}
                onPress={reset}
                disabled={!dirty}
              />
              <Button
                size="sm"
                icon="device-floppy"
                label={save.status === 'saving' ? t('common.saving') : t('common.save')}
                onPress={saveProfile}
                loading={save.status === 'saving'}
                disabled={!canSave}
              />
            </Row>
          </Row>
        ) : null}
      </div>
    </main>
  );
}

function dockStyle(): CSSProperties {
  return {
    position: 'sticky',
    bottom: 0,
    marginTop: 24,
    paddingTop: 24,
    paddingBottom: 20,
    backgroundImage: `linear-gradient(to top, ${color('bg')} 0%, ${color('bg/90')} 60%, ${color('bg/0')} 100%)`,
  };
}

function SaveStatusLabel({
  dirty,
  status,
  error,
}: Readonly<{ dirty: boolean; status: string; error: string | null }>) {
  const t = useT();
  if (status === 'saved')
    return (
      <Row gap={8}>
        <Icon name="check" size={16} stroke={2.4} color="success" />
        <Text variant="meta" color="success">
          {t('account.profileSaved')}
        </Text>
      </Row>
    );
  if (status === 'error')
    return (
      <Text variant="meta" color="danger">
        {error}
      </Text>
    );
  if (dirty)
    return (
      <Row gap={10}>
        <Box w={7} h={7} radius="circle" bg="accent" />
        <Text variant="meta" color="textMuted">
          {t('account.unsaved')}
        </Text>
      </Row>
    );
  return null;
}
