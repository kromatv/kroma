import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { Focusable } from './focusable';

const s = styles({ demo: { py: 16, px: 28, radius: 'lg', bg: 'surface2' } });

export default story({
  name: 'Focusable',
  group: 'Actions',
  docs: "The kit's only focusable primitive. Every control reachable with the remote is one, and it carries the 10-foot affordance: a solid amber ring plus a dark elevation, with an optional scale.",
  matrix: false,
  args: { focusScale: 1.06, ring: true, disabled: false },
  controls: { focusScale: { min: 1, max: 1.2, step: 0.02 } },
  render: (props) => (
    <Box row wrap align="center" gap={24}>
      <Focusable {...props} autoFocus label="first" style={s.demo}>
        <Txt>first</Txt>
      </Focusable>
      <Focusable {...props} label="second" style={s.demo}>
        <Txt>second</Txt>
      </Focusable>
      <Focusable {...props} label="third" style={s.demo}>
        <Txt>third</Txt>
      </Focusable>
    </Box>
  ),
});
