import type { NotificationPrefs, PrefsUpdate } from '@kromatv/client/notifications';
import {
  channelReach,
  NOTIFICATION_CATEGORY_LABEL,
  type NotificationChannel,
  prefsSections,
  sectionSwitched,
  typeSwitched,
} from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { CHANNEL, CHANNELS } from '#web/features/accounts/account/channel-toggles.component';
import {
  type PreferenceRows,
  type SwitchPreference,
  switchRow,
} from '#web/features/accounts/preference-commands';

const KEYWORDS = 'notifications alerts alertes push';

interface ChannelSwitch {
  id: string;
  label: string;
  subtitle: string;
  channel: NotificationChannel;
  reach: SwitchPreference['reach'];
  update: (on: boolean) => PrefsUpdate;
}

interface Context {
  t: Translate;
  save: (update: PrefsUpdate) => Promise<void>;
}

function channelSwitches(prefs: NotificationPrefs, t: Translate): ChannelSwitch[] {
  return prefsSections(prefs).flatMap((section) => {
    const name = t(NOTIFICATION_CATEGORY_LABEL[section.category.category]);
    return CHANNELS.flatMap((channel): ChannelSwitch[] => {
      const via = t(CHANNEL[channel].label);
      const category: ChannelSwitch = {
        id: `${section.category.category}:${channel}`,
        label: name,
        subtitle: via,
        channel,
        reach: channelReach(section, channel),
        update: (on) => sectionSwitched(section, channel, on),
      };
      const kinds = section.types.map((type): ChannelSwitch => ({
        id: `${type.type}:${channel}`,
        label: type.label,
        subtitle: `${name} · ${via}`,
        channel,
        reach: { on: Number(type[channel]), of: 1 },
        update: (on) => typeSwitched(type, { [channel]: on }),
      }));
      return [category, ...kinds];
    });
  });
}

function asSwitch(face: ChannelSwitch, { t, save }: Context): SwitchPreference {
  return {
    id: `notify:${face.id}`,
    label: face.label,
    subtitle: face.subtitle,
    icon: CHANNEL[face.channel].on,
    keywords: KEYWORDS,
    reach: face.reach,
    setOn: (on) => save(face.update(on)),
    done: t('common.saved'),
  };
}

/** The account's delivery matrix in the command menu: a row that opens it on the
 *  account page, and one switch per category and per kind for each channel, with no
 *  matrix to read yet only the first. */
export function notificationRows(
  prefs: NotificationPrefs | undefined,
  context: Context,
): PreferenceRows {
  const { t } = context;
  const name = t('notifications.settings');
  const switches = prefs ? channelSwitches(prefs, t) : [];
  return {
    head: {
      id: 'pref:notifications',
      label: name,
      icon: 'bell',
      keywords: KEYWORDS,
      to: '/account',
      search: { section: 'notifications' },
    },
    values: switches.map((face) => switchRow(asSwitch(face, context), t)),
    words: `${name} ${KEYWORDS} ${CHANNELS.map((channel) => t(CHANNEL[channel].label)).join(' ')}`,
  };
}
