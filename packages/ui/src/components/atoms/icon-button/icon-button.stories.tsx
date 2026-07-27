import { story } from '@kroma/workbench/story';
import { IconButton, iconButtonVariants } from './icon-button';

export default story({
  name: 'IconButton',
  group: 'Actions',
  docs: "A square button with no text, for the player's toolbars. The label stays mandatory: it is not displayed, but it names the command for accessibility.",
  variants: iconButtonVariants,
  args: {
    icon: 'volume',
    label: 'Volume',
    size: 44,
    disabled: false,
    active: false,
    focusFill: false,
  },
  controls: { icon: 'icon', size: { min: 28, max: 72, step: 4 } },
  render: (props) => <IconButton {...props} />,
});
