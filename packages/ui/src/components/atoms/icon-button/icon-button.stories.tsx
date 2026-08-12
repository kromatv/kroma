import { story } from '@kroma/workbench/story';
import { IconButton, iconButtonVariants } from './icon-button';

export default story({
  name: 'IconButton',
  group: 'Actions',
  docs: "A square button with no text, for the player's toolbars. The label stays mandatory: it is not displayed, but it names the command for accessibility.",
  variants: iconButtonVariants,
  component: IconButton,
  args: { icon: 'volume', label: 'Volume', diameter: 44, disabled: false },
  controls: { icon: 'icon', diameter: { min: 28, max: 72, step: 4 } },
});
