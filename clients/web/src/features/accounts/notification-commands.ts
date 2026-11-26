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
import { type SwitchPreference, switchRow } from '#web/features/accounts/preference-commands';
import type { CommandDef } from '#web/shared/lib/command-menu';

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
    keywords: '',
    reach: face.reach,
    setOn: (on) => save(face.update(on)),
    done: t('common.saved'),
  };
}

/** The account's delivery matrix in the command menu, as one row whose list holds a
 *  switch per category and per kind for each channel, and whose second action opens the
 *  matrix on the account page. With no matrix to read yet, the row only opens the page. */
export function notificationCommand(
  prefs: NotificationPrefs | undefined,
  context: Context,
): CommandDef {
  const { t } = context;
  const switches = prefs ? channelSwitches(prefs, t) : [];
  return {
    id: 'pref:notifications',
    label: t('notifications.settings'),
    icon: 'bell',
    keywords: `${KEYWORDS} ${CHANNELS.map((channel) => t(CHANNEL[channel].label)).join(' ')}`,
    to: '/account',
    search: { section: 'notifications' },
    items: switches.map((face) => switchRow(asSwitch(face, context), t)),
  };
}
