import { useT } from '@kroma/ui';
import { IconButton } from '@kroma/ui/kit';

/**
 * The control that opens a navigation sheet, in the one spelling every topbar
 * uses: the catalogue's and the console's alike.
 *
 * Stated once beside `useNavActions`, for the same reason: the two topbars may
 * not reach into each other, so the button they share cannot live in either.
 * Its faces are the bell's, which is what it stands next to.
 */
export function NavMenuButton({ open, onPress }: Readonly<{ open: boolean; onPress: () => void }>) {
  const t = useT();
  return (
    <IconButton
      variant={open ? 'glass' : 'ghost'}
      diameter={40}
      radius="md"
      glyph={22}
      icon="menu-2"
      label={t('nav.menu')}
      expanded={open}
      onPress={onPress}
    />
  );
}
