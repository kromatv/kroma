import type { DeclaredPurpose, Rule, RulesUpdate } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { CORE_CALLER } from '#web/features/admin/network-callers';
import { distinctSorted } from '#web/features/admin/network-flows';

export type RulePreset = 'downloadsVpn' | 'everythingVpn' | 'bareMinimum';

export const RULE_PRESETS: readonly {
  preset: RulePreset;
  labelKey: MessageKey;
  hintKey: MessageKey;
}[] = [
  {
    preset: 'downloadsVpn',
    labelKey: 'network.presetDownloads',
    hintKey: 'network.presetDownloadsHint',
  },
  {
    preset: 'everythingVpn',
    labelKey: 'network.presetEverything',
    hintKey: 'network.presetEverythingHint',
  },
  {
    preset: 'bareMinimum',
    labelKey: 'network.presetMinimum',
    hintKey: 'network.presetMinimumHint',
  },
];

type Matcher = Omit<Rule, 'id' | 'note'>;

function numbered(matchers: readonly Matcher[]): Rule[] {
  return matchers.map((matcher, index) => ({ id: `r-${index + 1}`, note: null, ...matcher }));
}

function moduleCallers(purposes: readonly DeclaredPurpose[]): string[] {
  return distinctSorted(
    purposes.map((declared) => declared.caller).filter((caller) => caller !== CORE_CALLER),
  );
}

/** The whole list a preset stands for, built from the purposes the server
 * declared. `core` is the server itself; every other caller is a module. */
export function presetRules(preset: RulePreset, purposes: readonly DeclaredPurpose[]): RulesUpdate {
  switch (preset) {
    case 'downloadsVpn':
      return {
        defaultAction: 'allow',
        rules: numbered(
          moduleCallers(purposes).map((caller) => ({
            caller,
            purpose: null,
            host: null,
            action: 'vpn',
          })),
        ),
      };
    case 'everythingVpn':
      return {
        defaultAction: 'allow',
        rules: numbered([{ caller: null, purpose: null, host: null, action: 'vpn' }]),
      };
    case 'bareMinimum':
      return {
        defaultAction: 'block',
        rules: numbered(
          purposes
            .filter((declared) => declared.caller === CORE_CALLER)
            .map(({ caller, purpose }) => ({ caller, purpose, host: null, action: 'direct' })),
        ),
      };
    default: {
      const unknown: never = preset;
      return unknown;
    }
  }
}
