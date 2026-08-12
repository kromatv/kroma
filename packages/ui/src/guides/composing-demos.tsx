import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Callout } from '#ui/components/molecules/callout';
import { ChoiceList } from '#ui/components/molecules/choice-list';
import { space } from '#ui/core/tokens';

/** A list written in parts: the Root owns the value and the group role, and
 * every part inside a row is a face on the one control. */
function ChoiceDemo() {
  const [picked, setPicked] = useState('films');
  return (
    <Box gap={space[6]} w={320} maxW="100%">
      <ChoiceList.Root label="Bibliotheque" value={picked} onValueChange={setPicked}>
        <ChoiceList.Item value="films">
          <ChoiceList.Label>Films</ChoiceList.Label>
          <ChoiceList.Hint>1 284 titres</ChoiceList.Hint>
        </ChoiceList.Item>
        <ChoiceList.Item value="series">
          <ChoiceList.Label>Series</ChoiceList.Label>
          <ChoiceList.Hint>312 titres</ChoiceList.Hint>
        </ChoiceList.Item>
      </ChoiceList.Root>
    </Box>
  );
}

/** One block, four parts: what the same row took four props to say, arranged
 * instead. */
function CalloutParts() {
  return (
    <Box w={560} maxW="100%">
      <Callout.Root tone="danger">
        <Callout.Media name="alert-triangle" />
        <Callout.Title>Le fichier est introuvable</Callout.Title>
        <Callout.Detail>/Volumes/video/Dune.2021.mkv</Callout.Detail>
        <Callout.Actions>
          <Button label="Reanalyser" size="sm" variant="ghost" />
        </Callout.Actions>
      </Callout.Root>
    </Box>
  );
}

export { CalloutParts, ChoiceDemo };
