// The `/account` settings page, laid out to the KROMA "Mon profil" design: a
// title + sections (photo, personal info, language & preferences, security),
// with a sticky save bar that batches the editable profile fields (name, email,
// audio/subtitle prefs) into one `PATCH /auth/me`. The photo uploads on pick,
// and password / PIN keep their own action buttons everything acts on the
// signed-in account and syncs across devices via the server.

import type { AccountPatch } from '@kroma/core';
import { prefValue } from '@kroma/core/react';
import { useT } from '@kroma/ui';
import { EmptyState } from '@kroma/ui/kit';
import { IconAt, IconCheck, IconMail } from '@tabler/icons-react';
import { useState } from 'react';
import { NotificationsCard } from '#web/features/accounts/account/notifications-card';
import { PasskeysCard } from '#web/features/accounts/account/passkeys-card';
import { PinCard } from '#web/features/accounts/account/pin-card';
import { NONE, PreferencesCard } from '#web/features/accounts/account/preferences-card';
import { PhotoCard } from '#web/features/accounts/account/profile-card';
import { SecurityCard } from '#web/features/accounts/account/security-card';
import { SessionsCard } from '#web/features/accounts/account/sessions-card';
import { LabeledInput, Panel, Section, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';
import { Button, PAGE_SUBTITLE, PAGE_TITLE } from '#web/shared/ui';

export function AccountPage() {
  const t = useT();
  const { user } = useAuth();

  if (!user) {
    return (
      <main className="min-w-0 px-(--gutter-web) pb-20 pt-9">
        <EmptyState icon="user-off" title={t('account.signedOut')} />
      </main>
    );
  }

  // Keyed by account id so switching profiles remounts the editor and re-seeds
  // its pending-edit state from the fresh account.
  return <ProfileEditor key={user.id} />;
}

function ProfileEditor() {
  const t = useT();
  const { user, client, updateUser, logout } = useAuth();

  // Pending edits for the batch-saved fields, seeded once from the account.
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  // Through `prefValue`, always: the server stores a playback language
  // lower-cased (`norm_media_lang`), so a Quebec preference comes back as
  // `fr-ca` while the picker's option for it is `fr-CA`. Seeded raw, the select
  // matched no option, `withCurrent` appended a second "Français" row, and the
  // form read as dirty the moment it loaded.
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
      // Mirror the server's normalisation (e.g. lower-cased email) back into the
      // fields so the form settles to "no unsaved changes".
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
          <LabeledInput
            label={t('auth.username')}
            autoComplete="nickname"
            leading={<IconAt size={17} className="text-dim" stroke={1.8} />}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <LabeledInput
            className="sm:col-span-2"
            label={t('auth.email')}
            type="email"
            autoComplete="email"
            leading={<IconMail size={17} className="text-dim" stroke={1.8} />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
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

      {/* Sticky save bar batches the editable profile fields above. */}
      <div className="sticky bottom-0 mt-6 bg-linear-to-t from-bg via-bg/90 to-transparent pb-5 pt-6">
        {dirty || save.status !== 'idle' ? (
          <div className="flex items-center justify-between gap-4 rounded-[14px] border border-border-strong bg-surface-2 py-3 pl-5 pr-3 shadow-pop">
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

/** The left side of the save bar: saved ✓ / error / unsaved dot. */
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
