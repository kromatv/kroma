import { useT } from '@kromatv/ui';
import {
  Box,
  CommandKeys,
  Focusable,
  Icon,
  IconButton,
  Text,
  useBreakpoint,
} from '@kromatv/ui/kit';
import { useCommandMenu } from '#web/shared/lib/command-menu';
import { SIDE_NAV_GLYPH, sideNavField } from '#web/shared/ui/side-nav-style';

/** The way into the command menu on a narrow window, where a navigation band has
 *  no room for {@link CommandMenuField}. */
export function CommandMenuButton() {
  const t = useT();
  const { open } = useCommandMenu();
  const step = useBreakpoint();
  if (step === 'lg' || step === 'tv') return null;
  return (
    <IconButton
      variant="ghost"
      diameter={40}
      radius="md"
      label={t('nav.commandMenu')}
      onPress={open}
    >
      <Icon name="search" size={20} />
    </IconButton>
  );
}

/** The way into the command menu in a sidebar, shaped like the field it opens and
 *  carrying the key, which teaches the shortcut to everyone who ever clicks it. */
export function CommandMenuField() {
  const t = useT();
  const { open } = useCommandMenu();
  return (
    <Focusable label={t('nav.commandMenu')} ring={false} onPress={open} sv={sideNavField}>
      <Icon name="search" size={SIDE_NAV_GLYPH} thickness={1.7} color="textDim" />
      <Text variant="meta" color="textDim" lines={1}>
        {t('nav.commandMenu')}
      </Text>
      <Box flex />
      <CommandKeys />
    </Focusable>
  );
}
