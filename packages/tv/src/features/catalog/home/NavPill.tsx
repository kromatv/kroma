// The section switcher at the top of every browse screen. The capsule itself -
// the metrics, the amber lens, the travelling ink - now lives in the kit
// (@kroma/ui NavPill), where the iPhone's tab bar draws the same design at
// thumb distance; see the kit story for the whole argument. What stays here is
// this app's shape for it: the section list as DATA.

import { Frost, type IconName, NavPill as KitNavPill, NavPillItem } from '@kroma/ui/kit';

export interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
}

/** The capsule itself: the items, and nothing about what they mean. */
export function NavPill({
  items,
  active,
}: Readonly<{
  items: readonly NavItem[];
  /** Key of the current section, or none on a deep screen (detail / person). */
  active?: string;
}>) {
  return (
    // The capsule frosts the hero art scrolling under it - the same <Frost>
    // the glass buttons and episode cards carry, in the slot the iPhone fills
    // with its own BlurView. Platforms without a blur (legacy panels, an
    // unregistered shell) keep the pill's solid fill.
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
