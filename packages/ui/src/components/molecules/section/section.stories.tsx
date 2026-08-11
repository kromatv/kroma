import { story } from '@kroma/workbench/story';
import { Chip } from '#ui/components/atoms/chip';
import { Text } from '#ui/components/atoms/text';
import { Section } from './section';

function Parts() {
  return (
    <Section.Root>
      <Section.Header>
        <Section.Title>Playback</Section.Title>
        <Section.Actions>
          <Chip variant="subtle" label="See all" />
        </Section.Actions>
      </Section.Header>
      <Text color="textMuted">First line of the band</Text>
      <Text color="textMuted">Second line of the band</Text>
    </Section.Root>
  );
}

function Untitled() {
  return (
    <Section.Root>
      <Text color="textMuted">A band with no header carries no rule either</Text>
    </Section.Root>
  );
}

export default story({
  name: 'Section',
  group: 'Layout',
  docs: 'A titled band: an overline, a rule, and the content. Every settings screen had its own copy of this arrangement, with slightly different spacing each time.\n\nComposed: `Root` owns the column, and `Header`, `Title` and `Actions` are named parts. The rule belongs to the `Header` - it is what separates the header from the content - so a band written without one has no rule to explain. `Root` sorts its direct children once: a `Header` sits at the top, everything else is content spaced by `gap`.',
  usage: `<Section.Root title="Playback">
  <PlaybackCard />
</Section.Root>

// The same band, written as its parts.
<Section.Root>
  <Section.Header>
    <Section.Title>Playback</Section.Title>
    <Section.Actions>
      <Chip variant="subtle" label="See all" onPress={seeAll} />
    </Section.Actions>
  </Section.Header>
  <PlaybackCard />
</Section.Root>`,
  guidelines: {
    do: [
      'Use it for every band on a settings or console page, so they share one rhythm.',
      'Let `gap` space the content rows rather than adding margins to them.',
    ],
    dont: [
      "Don't open a page with one - that is a <PageHeader>.",
      "Don't wrap <Section.Header> in a layout view: only a direct child sits above the rule.",
    ],
  },
  matrix: false,
  // A band takes the column it is put in, so it is given a range: the title, its
  // action and the rule have to hold together at both ends of it.
  width: { min: 320, max: 720 },
  args: { title: 'Playback', gap: 16 },
  controls: { gap: { min: 0, max: 40, step: 4 } },
  render: (props) => (
    <Section.Root {...props} actions={<Chip variant="subtle" label="See all" />}>
      <Text color="textMuted">First line of the band</Text>
      <Text color="textMuted">Second line of the band</Text>
    </Section.Root>
  ),
  scenes: [
    {
      name: 'Written as its parts',
      docs: 'The same band the sugar renders, spelled out. `Actions` pushes itself to the end of the header row, so the title needs no spacer beside it.',
      render: () => <Parts />,
    },
    {
      name: 'No header',
      docs: 'A band with neither a title nor an action is content on its own rhythm: no overline, and no rule hanging above nothing.',
      render: () => <Untitled />,
    },
  ],
});
