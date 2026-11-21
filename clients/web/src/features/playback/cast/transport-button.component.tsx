import { IconButton, type IconName } from '@kromatv/ui/kit';

interface TransportButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}

/** One round key of the docked remote. `primary` is the play / pause key. */
export function TransportButton({ icon, label, onPress, primary }: Readonly<TransportButtonProps>) {
  return (
    <IconButton
      variant={primary ? 'glass' : 'ghost'}
      diameter={primary ? 36 : 32}
      glyph={primary ? 20 : 18}
      icon={icon}
      label={label}
      onPress={onPress}
    />
  );
}
