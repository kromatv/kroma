// Preferences section: UI language (applied immediately) plus the preferred
// audio and subtitle languages, which the parent persists with `PATCH /auth/me`.

import { LANG_NO_PREF, LOCALES, langName, langOptions } from '@kroma/core';
import { useLocale, useSetLocale, useT } from '@kroma/ui';
import { Select } from '@kroma/ui/kit';
import { IconBadgeCc, IconLanguage, IconVolume } from '@tabler/icons-react';
import { useMemo } from 'react';
import { PrefRow } from '#web/features/accounts/account/ui';

// Radix Select forbids an empty value, so "no preference" uses this sentinel
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
    <div className="divide-y divide-border/70 overflow-visible rounded-xl border border-border bg-surface-1 shadow-card">
      <PrefRow
        icon={<IconLanguage size={18} stroke={1.7} />}
        label={t('account.uiLanguage')}
        desc={t('account.uiLanguageDesc')}
        control={
          <Select
            label={t('account.uiLanguage')}
            value={locale}
            onChange={(v) => setLocale(v as (typeof LOCALES)[number]['code'])}
            options={LOCALES.map((l) => ({ value: l.code, label: t(l.labelKey) }))}
          />
        }
      />
      <PrefRow
        icon={<IconVolume size={18} stroke={1.7} />}
        label={t('account.audioLanguage')}
        desc={t('account.audioDesc')}
        control={
          <Select
            label={t('account.audioLanguage')}
            value={audio}
            onChange={onAudio}
            options={withCurrent(audio, [
              { value: NONE, label: t('account.noPreference') },
              ...langs,
            ])}
          />
        }
      />
      <PrefRow
        icon={<IconBadgeCc size={18} stroke={1.7} />}
        label={t('account.subtitleLanguage')}
        desc={t('account.subtitleDesc')}
        control={
          <Select
            label={t('account.subtitleLanguage')}
            value={subtitle}
            onChange={onSubtitle}
            options={withCurrent(subtitle, [
              { value: NONE, label: t('account.noPreference') },
              { value: 'off', label: t('player.subtitlesOff') },
              ...langs,
            ])}
          />
        }
      />
    </div>
  );
}
