import type { Translate } from '@kromatv/i18n';
import { useLocale, useT } from '@kromatv/ui';
import { useMemo } from 'react';
import { ratingsChoices, ratingsValue } from '#web/features/accounts/account/ratings-choices';
import { useDevicePush } from '#web/features/accounts/account/use-device-push.hook';
import { useNotificationPrefs } from '#web/features/accounts/account/use-notification-prefs.hook';
import { useRatingsCountry } from '#web/features/accounts/account/use-ratings-country.hook';
import { notificationRows } from '#web/features/accounts/notification-commands';
import {
  type ChoicePreference,
  choiceRows,
  listedRows,
  type PreferenceRows,
  switchRow,
} from '#web/features/accounts/preference-commands';
import { useLanguagePreferences } from '#web/features/accounts/use-language-preferences.hook';
import { useBlurPreference } from '#web/shared/lib/blur-pref';
import { useCommandQuery, useCommands } from '#web/shared/lib/command-menu';
import { useKidsSession } from '#web/shared/lib/use-kids-session.hook';

interface Asked {
  t: Translate;
  enabled: boolean;
}

const alone = (head: PreferenceRows['head']): PreferenceRows => ({ head, values: [], words: '' });

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

function useBlurRows({ t }: Asked): PreferenceRows {
  const [blur, setBlur] = useBlurPreference();
  return alone(
    switchRow(
      {
        id: 'blur',
        label: t('settings.blur'),
        icon: 'blur',
        keywords: 'blur flou glass verre transparency transparence',
        reach: { on: Number(blur), of: 1 },
        setOn: setBlur,
      },
      t,
    ),
  );
}

function usePushRows({ t, enabled }: Asked): PreferenceRows {
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
  return alone(blocker ? null : row);
}

function usePreferenceRows(asked: Asked): PreferenceRows[] {
  const { t } = asked;
  const { screen, tracks } = useLanguagePreferences(t);
  const ratings = useRatingsPreference(asked);
  const blur = useBlurRows(asked);
  const push = usePushRows(asked);
  const { prefs, save } = useNotificationPrefs({ enabled: asked.enabled });
  return [
    choiceRows(screen, t),
    blur,
    ...tracks.map((track) => choiceRows(track, t)),
    ...(ratings ? [choiceRows(ratings, t)] : []),
    push,
    notificationRows(prefs, { t, save }),
  ];
}

/** Every preference of the account page in the command menu, under one heading. With
 *  nothing typed each one is a row: a switch flips on Enter, and a list says the value
 *  in use and opens its place on the page. Typing lists each value of a list as a row
 *  of its own, the one in use marked, and a long list once the query names it. A Kids
 *  session, which never opens the account page, gets none of them. */
export function usePreferenceCommands(): void {
  const t = useT();
  const kids = useKidsSession();
  const typed = useCommandQuery().trim();
  const preferences = usePreferenceRows({ t, enabled: !kids });
  useCommands(kids ? [] : preferences.flatMap((rows) => listedRows(rows, typed)), {
    group: t('account.preferences'),
  });
}
