import { story } from '@kroma/workbench/story';
import { Chip } from '#ui/components/atoms/chip';
import { Txt } from '#ui/components/atoms/text';
import { Section } from './section';

export default story({
  name: 'Section',
  group: 'Layout',
  docs: 'A titled band: an overline, a rule, and the content. Every settings screen had its own copy of this arrangement, with slightly different spacing each time.',
  matrix: false,
  // A band takes the column it is put in, so it is given a range: the title, its
  // action and the rule have to hold together at both ends of it.
  width: { min: 320, max: 720 },
  args: { title: 'Playback', rule: true, gap: 16 },
  controls: { gap: { min: 0, max: 40, step: 4 } },
  render: (props) => (
    <Section {...props} action={<Chip variant="subtle" label="See all" />}>
      <Txt color="textMuted">First line of the band</Txt>
      <Txt color="textMuted">Second line of the band</Txt>
    </Section>
  ),
});
