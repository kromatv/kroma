// Preferences section: UI language and the background blur (the blur per
// device) plus the preferred audio and subtitle languages. Each one is saved
// the moment it is chosen.

import { LANG_NO_PREF, LOCALES, langName, langOptions, localeLabel } from '@kromatv/core';
import { prefValue } from '@kromatv/core/react';
import { useLocale, useSetLocale, useT } from '@kromatv/ui';
import { ListRow, Select, Switch, Text } from '@kromatv/ui/kit';
import { useMemo, useState } from 'react';
import { RatingsCountryRow } from '#web/features/accounts/account/ratings-country-row.component';
import { PrefRow, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';
import { useBlurPreference } from '#web/shared/lib/blur-pref';

// '' means "nothing picked" to <Select>, so "no preference" uses this sentinel
// and is mapped back to `null` on the way to the server.
export const NONE = LANG_NO_PREF;

type Track = 'audioLanguage' | 'subtitleLanguage';

export function PreferencesCard() {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [blur, setBlur] = useBlurPreference();
  const { user, client, updateUser } = useAuth();
  // The server lower-cases a playback language (`fr-ca`) while the picker's
  // option is `fr-CA`; `prefValue` normalizes so a raw seed still matches.
  const [audio, setAudio] = useState(prefValue(user?.audioLanguage ?? null));
  const [subtitle, setSubtitle] = useState(prefValue(user?.subtitleLanguage ?? null));
  const save = useSave();

  const choose = (track: Track, value: string) => {
    const set = track === 'audioLanguage' ? setAudio : setSubtitle;
    const before = track === 'audioLanguage' ? audio : subtitle;
    set(value);
    void save.run(async () => {
      try {
        const { user: saved } = await client.accounts.update({
          [track]: value === NONE ? null : value,
        });
        updateUser({ [track]: saved[track] ?? null });
        set(prefValue(saved[track] ?? null));
      } catch (error) {
        set(before);
        throw error;
      }
    }, t('account.saveFailed'));
  };

  // Sorting ~190 names on every keystroke in the profile form above this card.
  const langs = useMemo(
    () => langOptions(t, locale).map(({ code, label }) => ({ value: code, label })),
    [t, locale],
  );

  // Keep the current value selectable even when it is not in the list (a code set
  // on the TV, say), or the trigger shows blank and the stored preference is lost.
  const withCurrent = (value: string, opts: { value: string; label: string }[]) =>
    opts.some((o) => o.value === value)
      ? opts
      : [...opts, { value, label: langName(t, value) ?? value.toUpperCase() }];

  return (
    <ListRow.Group size="md">
      <PrefRow
        icon="language"
        label={t('account.uiLanguage')}
        desc={t('account.uiLanguageDesc')}
        control={
          <Select.Root
            label={t('account.uiLanguage')}
            value={locale}
            onValueChange={(v) => setLocale(v as (typeof LOCALES)[number]['code'])}
          >
            <Select.Trigger />
            {LOCALES.map((l) => (
              <Select.Item key={l.code} value={l.code} label={localeLabel(t, l)} />
            ))}
          </Select.Root>
        }
      />
      <PrefRow
        icon="blur"
        label={t('settings.blur')}
        desc={t('settings.blurDesc')}
        control={<Switch label={t('settings.blur')} checked={blur} onCheckedChange={setBlur} />}
      />
      <PrefRow
        icon="volume"
        label={t('account.audioLanguage')}
        desc={t('account.audioDesc')}
        control={
          <Select.Root
            label={t('account.audioLanguage')}
            value={audio}
            onValueChange={(value) => choose('audioLanguage', value)}
          >
            <Select.Trigger />
            {withCurrent(audio, [{ value: NONE, label: t('account.noPreference') }, ...langs]).map(
              (o) => (
                <Select.Item key={o.value} value={o.value} label={o.label} />
              ),
            )}
          </Select.Root>
        }
      />
      <PrefRow
        icon="badge-cc"
        label={t('account.subtitleLanguage')}
        desc={t('account.subtitleDesc')}
        control={
          <Select.Root
            label={t('account.subtitleLanguage')}
            value={subtitle}
            onValueChange={(value) => choose('subtitleLanguage', value)}
          >
            <Select.Trigger />
            {withCurrent(subtitle, [
              { value: NONE, label: t('account.noPreference') },
              { value: 'off', label: t('player.subtitlesOff') },
              ...langs,
            ]).map((o) => (
              <Select.Item key={o.value} value={o.value} label={o.label} />
            ))}
          </Select.Root>
        }
      />
      <RatingsCountryRow />
      {save.status === 'error' ? (
        <ListRow.Root>
          <Text variant="meta" color="danger">
            {save.error}
          </Text>
        </ListRow.Root>
      ) : null}
    </ListRow.Group>
  );
}
