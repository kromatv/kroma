import { Chip } from '#ui/components/atoms/chip';

import { Text } from '#ui/components/atoms/text';

import { Section } from './section';

export function Parts() {
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

export function Untitled() {
  return (
    <Section.Root>
      <Text color="textMuted">A band with no header carries no rule either</Text>
    </Section.Root>
  );
}
