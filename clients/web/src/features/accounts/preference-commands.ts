import type { Translate } from '@kromatv/i18n';
import type { IconName } from '@kromatv/ui/kit';
import type { CommandDef } from '#web/shared/lib/command-menu';

/** One value a preference can take, and what picking it does. */
export interface PreferenceChoice {
  value: string;
  label: string;
  subtitle?: string;
  flag?: string;
  lang?: string;
  pick: () => unknown;
}

/** A preference that takes one value of a list. */
export interface ChoicePreference {
  id: string;
  name: string;
  icon: IconName;
  keywords: string;
  current: string;
  choices: readonly PreferenceChoice[];
  done?: string;
}

/** A preference that is on or off, or on for some of what it speaks for. */
export interface SwitchPreference {
  id: string;
  label: string;
  subtitle?: string;
  icon: IconName;
  keywords: string;
  reach: { on: number; of: number };
  setOn: (on: boolean) => unknown;
  done?: string;
}

function choiceRow(pref: ChoicePreference, choice: PreferenceChoice, t: Translate): CommandDef {
  const { label, subtitle, flag, lang, pick } = choice;
  return {
    id: `pref:${pref.id}:${choice.value}`,
    label,
    subtitle,
    flag,
    lang,
    icon: pref.icon,
    status:
      choice.value === pref.current ? { label: t('commands.current'), tone: 'success' } : undefined,
    primaryLabel: t('commands.choose'),
    done: pref.done,
    run: pick,
  };
}

/** A preference that takes one value of a list, as one row naming it with the value in
 *  use at its end. Its list holds one row per value, the one in use marked, and its
 *  second action opens its place on the account page. */
export function choiceCommand(pref: ChoicePreference, t: Translate): CommandDef {
  const picked = pref.choices.find((choice) => choice.value === pref.current);
  return {
    id: `pref:${pref.id}`,
    label: pref.name,
    icon: pref.icon,
    flag: picked?.flag,
    keywords: pref.keywords,
    meta: picked?.label,
    to: '/account',
    search: { section: 'preferences' },
    items: pref.choices.map((choice) => choiceRow(pref, choice, t)),
  };
}

function switchStatus({ on, of }: SwitchPreference['reach'], t: Translate): CommandDef['status'] {
  if (on === of) {
    return { label: t('commands.on'), tone: 'success' };
  }
  return { label: t(on > 0 ? 'commands.partly' : 'commands.off'), tone: 'neutral' };
}

/** A switch as one row: its state as a badge, and Enter turning it on for everything it
 *  speaks for, or off once it is. */
export function switchRow(pref: SwitchPreference, t: Translate): CommandDef {
  const all = pref.reach.on === pref.reach.of;
  return {
    id: `pref:${pref.id}`,
    label: pref.label,
    subtitle: pref.subtitle,
    icon: pref.icon,
    keywords: pref.keywords,
    status: switchStatus(pref.reach, t),
    primaryLabel: t(all ? 'commands.turnOff' : 'commands.turnOn'),
    done: pref.done,
    run: () => pref.setOn(!all),
  };
}
