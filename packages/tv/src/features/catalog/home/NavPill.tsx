// The section switcher at the top of every browse screen; the capsule itself is
// the kit's `NavPill`.

import { Frost, type IconName, NavPill as KitNavPill, NavPillItem } from '@kroma/ui/kit';

export interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
}

export function NavPill({
  items,
  active,
}: Readonly<{
  items: readonly NavItem[];
  active?: string;
}>) {
  return (
    // Platforms without a blur (legacy panels, an unregistered shell) keep the
    // pill's solid fill.
    <KitNavPill size="tv" backdrop={<Frost amount={16} />}>
      {items.map((item) => (
        <NavPillItem
          key={item.key}
          icon={item.icon}
          label={item.label}
          active={item.key === active}
          onPress={item.onPress}
        />
      ))}
    </KitNavPill>
  );
}
