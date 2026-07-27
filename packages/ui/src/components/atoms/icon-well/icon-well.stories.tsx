import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { IconWell, iconWellVariants } from './icon-well';

const ROW = ['settings', 'language', 'device-tv', 'server-2', 'download'] as const;

export default story({
  name: 'IconWell',
  group: 'Foundations',
  docs: 'The leading mark of a row: a glyph sunk into a rounded, tinted square. A well rather than a bare glyph because it gives a column of icons ONE optical weight — a hollow gear and a solid television differ by half their ink, and the wells line them up anyway. `<ListRow>` draws its own; reach for this one when you are building a row the kit does not have.',
  usage: `<IconWell name="server-2" />
<IconWell name="plus" tone="accent" size="sm" />`,
  guidelines: {
    do: ['Keep one size per list, so the labels start on the same x.'],
    dont: [
      'Don\'t use the accent tone for more than one row in a list; it means "adds something".',
    ],
  },
  variants: iconWellVariants,
  args: { name: 'settings' },
  controls: { name: 'icon' },
  render: (props) => <IconWell {...props} />,
  scenes: [
    {
      name: 'A column of rows',
      docs: 'Five different drawings, one optical weight.',
      render: (props) => (
        <Box gap={12}>
          {ROW.map((name) => (
            <Box key={name} row align="center" gap={14}>
              <IconWell {...props} name={name} />
              <Txt variant="label">{name}</Txt>
            </Box>
          ))}
        </Box>
      ),
    },
  ],
});
