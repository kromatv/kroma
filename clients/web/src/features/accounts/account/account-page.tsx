import type { AccountPatch } from '@kroma/core';
import { prefValue } from '@kroma/core/react';
import { useT } from '@kroma/ui';
import { Button, EmptyState, Field } from '@kroma/ui/kit';
import { IconCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { NotificationsCard } from '#web/features/accounts/account/notifications-card';
import { PasskeysCard } from '#web/features/accounts/account/passkeys-card';
import { PinCard } from '#web/features/accounts/account/pin-card';
import { NONE, PreferencesCard } from '#web/features/accounts/account/preferences-card';
import { PhotoCard } from '#web/features/accounts/account/profile-card';
import { SecurityCard } from '#web/features/accounts/account/security-card';
import { SessionsCard } from '#web/features/accounts/account/sessions-card';
import { Panel, Section, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';
import { PAGE_SUBTITLE, PAGE_TITLE } from '#web/shared/ui';

export function AccountPage() {
  const t = useT();
  const { user } = useAuth();

  if (!user) {
    return (
      <main className="min-w-0 px-(--gutter-web) pb-20 pt-9">
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
    <main className="min-w-0 px-(--gutter-web) pb-20 pt-9">
      <header className="mb-2 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className={PAGE_TITLE}>{t('account.title')}</h1>
          <p className={`max-w-[560px] ${PAGE_SUBTITLE}`}>{t('account.subtitle')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon="logout"
          label={t('auth.logout')}
          onPress={() => void logout()}
        />
      </header>

      <Section title={t('account.sectionPhoto')}>
        <PhotoCard />
      </Section>

      <Section title={t('account.sectionInfo')}>
        <Panel className="grid grid-cols-1 gap-4.5 p-5.5 sm:grid-cols-2">
          <Field.Root label={t('auth.username')}>
            <Field.Input
              icon="at"
              value={username}
              onValueChange={setUsername}
              autoComplete="nickname"
            />
          </Field.Root>
          <div className="sm:col-span-2">
            <Field.Root label={t('auth.email')}>
              <Field.Input type="email" icon="mail" value={email} onValueChange={setEmail} />
            </Field.Root>
          </div>
        </Panel>
      </Section>

      <Section title={t('account.sectionPrefs')}>
        <PreferencesCard
          audio={audio}
          subtitle={subtitle}
          onAudio={setAudio}
          onSubtitle={setSubtitle}
        />
      </Section>

      <Section title={t('account.sectionNotifications')}>
        <NotificationsCard />
      </Section>

      <Section title={t('account.sectionSecurity')}>
        <SecurityCard />
        <PinCard />
        <PasskeysCard />
        <SessionsCard />
      </Section>

      <div className="sticky bottom-0 mt-6 bg-linear-to-t from-bg via-bg/90 to-transparent pb-5 pt-6">
        {dirty || save.status !== 'idle' ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border-strong bg-surface-2 py-3 pl-5 pr-3 shadow-pop">
            <div className="flex min-w-0 items-center gap-2.5">
              <SaveStatusLabel dirty={dirty} status={save.status} error={save.error} />
            </div>
            <div className="flex flex-none gap-2.5">
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
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function SaveStatusLabel({
  dirty,
  status,
  error,
}: Readonly<{ dirty: boolean; status: string; error: string | null }>) {
  const t = useT();
  if (status === 'saved')
    return (
      <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-success">
        <IconCheck size={16} stroke={2.4} />
        {t('account.profileSaved')}
      </span>
    );
  if (status === 'error')
    return <span className="text-[13.5px] font-semibold text-danger">{error}</span>;
  if (dirty)
    return (
      <span className="inline-flex items-center gap-2.5 text-[13.5px] font-semibold text-muted">
        <span className="size-[7px] rounded-full bg-accent" />
        {t('account.unsaved')}
      </span>
    );
  return null;
}
