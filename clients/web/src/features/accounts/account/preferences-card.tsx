// Preferences section: UI language and the background blur (both applied
// immediately, the blur per device) plus the preferred audio and subtitle
// languages, which the parent persists with `PATCH /auth/me`.

import { LANG_NO_PREF, LOCALES, langName, langOptions } from '@kroma/core';
import { useLocale, useSetLocale, useT } from '@kroma/ui';
import { ListRow, Select, Switch } from '@kroma/ui/kit';
import { useMemo, useState } from 'react';
import { PrefRow } from '#web/features/accounts/account/ui';
import { getBlurPref, setBlurPref } from '#web/shared/lib/blur-pref';

// '' means "nothing picked" to <Select>, so "no preference" uses this sentinel
// and is mapped back to `null` on the way to the server.
export const NONE = LANG_NO_PREF;

export function PreferencesCard({
  audio,
  subtitle,
  onAudio,
  onSubtitle,
}: Readonly<{
  audio: string;
  subtitle: string;
  onAudio: (value: string) => void;
  onSubtitle: (value: string) => void;
}>) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [blur, setBlur] = useState(getBlurPref);

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
              <Select.Item key={l.code} value={l.code} label={t(l.labelKey)} />
            ))}
          </Select.Root>
        }
      />
      <PrefRow
        icon="blur"
        label={t('settings.blur')}
        desc={t('settings.blurDesc')}
        control={
          <Switch
            label={t('settings.blur')}
            checked={blur}
            onCheckedChange={(on) => {
              setBlur(on);
              setBlurPref(on);
            }}
          />
        }
      />
      <PrefRow
        icon="volume"
        label={t('account.audioLanguage')}
        desc={t('account.audioDesc')}
        control={
          <Select.Root label={t('account.audioLanguage')} value={audio} onValueChange={onAudio}>
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
            onValueChange={onSubtitle}
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
    </ListRow.Group>
  );
}
