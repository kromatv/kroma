import {
  LANG_NO_PREF,
  LANG_OFF,
  LOCALES,
  langOptions,
  localeChoices,
  sortLocales,
} from '@kromatv/core';
import { prefValue } from '@kromatv/core/react';
import { flagRegion, type MessageKey, type Translate } from '@kromatv/i18n';
import { useLocale, useSetLocale } from '@kromatv/ui';
import type { IconName } from '@kromatv/ui/kit';
import { useMemo } from 'react';
import {
  saveTrackLanguage,
  type TrackLanguage,
} from '#web/features/accounts/account/track-language';
import type { ChoicePreference } from '#web/features/accounts/preference-commands';
import { useAuth } from '#web/shared/lib/auth';

interface TrackFace {
  name: MessageKey;
  icon: IconName;
  keywords: string;
  off: boolean;
}

const TRACK: Record<TrackLanguage, TrackFace> = {
  audioLanguage: {
    name: 'account.audioLanguage',
    icon: 'volume',
    keywords: 'audio sound son voice voix dub doublage',
    off: false,
  },
  subtitleLanguage: {
    name: 'account.subtitleLanguage',
    icon: 'badge-cc',
    keywords: 'subtitles sous-titres captions cc',
    off: true,
  },
};

function useInterfaceLanguage(t: Translate): ChoicePreference {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const choices = useMemo(() => sortLocales(localeChoices(LOCALES, t), locale), [t, locale]);
  return {
    id: 'locale',
    name: t('account.uiLanguage'),
    icon: 'language',
    keywords: 'language langue interface',
    current: locale,
    choices: choices.map((choice) => ({
      value: choice.code,
      label: choice.endonym,
      subtitle: choice.name === choice.endonym ? undefined : choice.name,
      flag: flagRegion(choice.code) ?? undefined,
      lang: choice.code,
      pick: () => setLocale(choice.code),
    })),
  };
}

function useTrackLanguages(t: Translate): ChoicePreference[] {
  const auth = useAuth();
  const locale = useLocale();
  const langs = useMemo(() => langOptions(t, locale), [t, locale]);
  const preferenceOf = (track: TrackLanguage): ChoicePreference => {
    const face = TRACK[track];
    const values = [
      { value: LANG_NO_PREF, label: t('account.noPreference') },
      ...(face.off ? [{ value: LANG_OFF, label: t('player.subtitlesOff') }] : []),
      ...langs.map(({ code, label }) => ({ value: code, label })),
    ];
    return {
      id: track,
      name: t(face.name),
      icon: face.icon,
      keywords: face.keywords,
      current: prefValue(auth.user?.[track] ?? null),
      choices: values.map(({ value, label }) => ({
        value,
        label,
        pick: () => saveTrackLanguage(auth, track, value),
      })),
      done: t('common.saved'),
    };
  };
  return [preferenceOf('audioLanguage'), preferenceOf('subtitleLanguage')];
}

/** The account's three languages as the command menu offers them: the interface's,
 *  each with its flag and its own name and applied as the account page applies it, then
 *  the preferred audio and subtitle languages, saved on the account. */
export function useLanguagePreferences(t: Translate): {
  screen: ChoicePreference;
  tracks: ChoicePreference[];
} {
  return { screen: useInterfaceLanguage(t), tracks: useTrackLanguages(t) };
}
