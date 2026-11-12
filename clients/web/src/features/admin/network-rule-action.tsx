import type { NetworkView, RuleAction } from '@kromatv/client/network';
import { useT } from '@kromatv/ui';
import { Badge, Field, SegmentGroup, Select } from '@kromatv/ui/kit';
import { RouteBadge } from '#web/features/admin/network-route-badge';
import {
  actionNetworks,
  DEFAULT_NETWORK,
  type NetworkChoice,
} from '#web/features/admin/network-rules';

/** What a network is called where a rule names it: the default VPN as such,
 *  any other by the name its module gave it. */
export function useNetworkName(): (choice: NetworkChoice) => string {
  const t = useT();
  return ({ name, label }) => {
    if (name !== DEFAULT_NETWORK) return label ?? name;
    return label ? t('network.actionDefaultVpn', { label }) : t('network.routeVpn');
  };
}

interface RuleActionFieldProps {
  value: RuleAction;
  networks: readonly NetworkView[];
  onChange: (action: RuleAction) => void;
}

/** Where a rule sends what it matches. Three segments while there is one
 *  network to name, a list once there are several. */
export function RuleActionField({ value, networks, onChange }: Readonly<RuleActionFieldProps>) {
  const t = useT();
  const nameOf = useNetworkName();
  const choices = actionNetworks(networks, value);

  if (choices.length > 1) {
    return (
      <Field.Root label={t('network.colAction')}>
        <Select.Root label={t('network.colAction')} value={value} onValueChange={onChange}>
          <Select.Trigger block />
          <Select.Item value="direct" label={t('network.actionDirect')} />
          {choices.map((choice) => (
            <Select.Item key={choice.name} value={choice.name} label={nameOf(choice)} />
          ))}
          <Select.Item value="block" label={t('network.actionBlock')} />
        </Select.Root>
        <Field.Hint>{t('network.actionNetworksHint')}</Field.Hint>
      </Field.Root>
    );
  }

  return (
    <Field.Root label={t('network.colAction')}>
      <SegmentGroup.Root<RuleAction>
        label={t('network.colAction')}
        value={value}
        onValueChange={onChange}
      >
        <SegmentGroup.Item value="direct">
          <SegmentGroup.Label>{t('network.actionDirect')}</SegmentGroup.Label>
        </SegmentGroup.Item>
        {choices.map((choice) => (
          <SegmentGroup.Item key={choice.name} value={choice.name}>
            <SegmentGroup.Label>
              {choice.name === DEFAULT_NETWORK ? t('network.routeVpn') : nameOf(choice)}
            </SegmentGroup.Label>
          </SegmentGroup.Item>
        ))}
        <SegmentGroup.Item value="block">
          <SegmentGroup.Label>{t('network.actionBlock')}</SegmentGroup.Label>
        </SegmentGroup.Item>
      </SegmentGroup.Root>
    </Field.Root>
  );
}

/** A rule's action as its row shows it: the route, or the server a rule pins. */
export function RuleActionBadge({
  action,
  networks,
}: Readonly<{ action: RuleAction; networks: readonly NetworkView[] }>) {
  const nameOf = useNetworkName();
  if (action === 'direct') return <RouteBadge route="direct" />;
  if (action === 'block') return <RouteBadge route="blocked" />;
  if (action === DEFAULT_NETWORK) return <RouteBadge route="vpn" />;
  const label = networks.find(({ name }) => name === action)?.label ?? null;
  return <Badge tone="info">{nameOf({ name: action, label })}</Badge>;
}
