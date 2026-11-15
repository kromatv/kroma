import { useT } from '@kromatv/ui';
import { commandKeyLabel, Icon, IconButton, Tooltip } from '@kromatv/ui/kit';
import { useCommandMenu } from '#web/shared/lib/command-menu';

/** The way into the command menu, in every navigation band. A hover names the key,
 *  which teaches the shortcut to everyone who ever reaches for the button. */
export function CommandMenuButton() {
  const t = useT();
  const { open } = useCommandMenu();
  const label = t('nav.commandMenu');
  return (
    <Tooltip label={`${label} ${commandKeyLabel()}`}>
      <IconButton variant="ghost" diameter={40} radius="md" label={label} onPress={open}>
        <Icon name="search" size={20} />
      </IconButton>
    </Tooltip>
  );
}
