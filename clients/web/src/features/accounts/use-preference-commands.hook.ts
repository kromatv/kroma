import type { Translate } from '@kromatv/i18n';
import { useLocale, useT } from '@kromatv/ui';
import { useMemo } from 'react';
import { ratingsChoices, ratingsValue } from '#web/features/accounts/account/ratings-choices';
import { useDevicePush } from '#web/features/accounts/account/use-device-push.hook';
import { useNotificationPrefs } from '#web/features/accounts/account/use-notification-prefs.hook';
import { useRatingsCountry } from '#web/features/accounts/account/use-ratings-country.hook';
import { notificationCommand } from '#web/features/accounts/notification-commands';
import {
  type ChoicePreference,
  choiceCommand,
  switchRow,
} from '#web/features/accounts/preference-commands';
import { useLanguagePreferences } from '#web/features/accounts/use-language-preferences.hook';
import { useBlurPreference } from '#web/shared/lib/blur-pref';
import { type CommandDef, useCommands } from '#web/shared/lib/command-menu';
import { useKidsSession } from '#web/shared/lib/use-kids-session.hook';

interface Asked {
  t: Translate;
  enabled: boolean;
}

function useRatingsPreference({ t, enabled }: Asked): ChoicePreference | null {
  const locale = useLocale();
  const { ratings, choose } = useRatingsCountry({ enabled });
  const choices = useMemo(
    () => (ratings ? ratingsChoices(ratings, { t, locale }) : []),
    [ratings, t, locale],
  );
  if (!ratings) {
    return null;
  }
  return {
    id: 'ratings',
    name: t('account.ratingsCountry'),
    icon: 'world',
    keywords: 'ratings age country pays classification certification',
    current: ratingsValue(ratings),
    choices: choices.map(({ value, label }) => ({
      value,
      label,
      flag: value,
      pick: () => choose(value),
    })),
    done: t('common.saved'),
  };
}

function useBlurRow({ t }: Asked): CommandDef {
  const [blur, setBlur] = useBlurPreference();
  return switchRow(
    {
      id: 'blur',
      label: t('settings.blur'),
      icon: 'blur',
      keywords: 'blur flou glass verre transparency transparence',
      reach: { on: Number(blur), of: 1 },
      setOn: setBlur,
    },
    t,
  );
}

function usePushRow({ t, enabled }: Asked): CommandDef | null {
  const { blocker, subscribed, setSubscribed } = useDevicePush({ enabled });
  const row = switchRow(
    {
      id: 'push',
      label: t('push.title'),
      icon: subscribed ? 'bell-ringing' : 'bell-off',
      keywords: 'push notifications alerts alertes',
      reach: { on: Number(subscribed), of: 1 },
      setOn: setSubscribed,
      done: t('common.saved'),
    },
    t,
  );
  return blocker ? null : row;
}

function usePreferenceRows(asked: Asked): (CommandDef | null)[] {
  const { t } = asked;
  const { screen, tracks } = useLanguagePreferences(t);
  const ratings = useRatingsPreference(asked);
  const blur = useBlurRow(asked);
  const push = usePushRow(asked);
  const { prefs, save } = useNotificationPrefs({ enabled: asked.enabled });
  return [
    choiceCommand(screen, t),
    blur,
    ...tracks.map((track) => choiceCommand(track, t)),
    ratings && choiceCommand(ratings, t),
    push,
    notificationCommand(prefs, { t, save }),
  ];
}

/** Every preference of the account page in the command menu, one row each under one
 *  heading. A switch flips on Enter. A list says the value in use, and Enter opens its
 *  values in place of the menu's, the one in use marked. A Kids session, which never
 *  opens the account page, gets none of them. */
export function usePreferenceCommands(): void {
  const t = useT();
  const kids = useKidsSession();
  const preferences = usePreferenceRows({ t, enabled: !kids });
  useCommands(kids ? [] : preferences, { group: t('account.preferences') });
}
