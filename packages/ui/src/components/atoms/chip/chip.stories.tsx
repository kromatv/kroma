import { story } from '@kroma/workbench/story';
import type { IconName } from '#ui/lib/glyph';
import { Chip, chipVariants } from './chip';

export default story({
  name: 'Chip',
  group: 'Actions',
  docs: 'A filter or a choice in a row. The active state is carried by the **amber fill**, never by text color alone.',
  usage: `<Chip label="Sci-Fi" active={selected} onPress={toggle} />`,
  guidelines: {
    do: [
      'Use `subtle` over ambient artwork - it recedes until focused.',
      'Use the `tv` size on any 10-foot screen: the small target is a mouse target.',
    ],
    dont: ["Don't use a Chip for a one-off action; that's a Button in a smaller coat."],
  },
  variants: chipVariants,
  args: { label: 'Added', icon: '' as IconName | '' },
  controls: { icon: 'icon' },
  render: ({ icon, ...props }) => <Chip {...props} icon={icon || undefined} />,
});
