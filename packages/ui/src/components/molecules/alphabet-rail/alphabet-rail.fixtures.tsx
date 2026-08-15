import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { AlphabetRail } from './alphabet-rail';
import type { LetterRange } from './alphabet-rail-context';

export const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export const AVAILABLE = new Set([...'ABCDEGHILMNOPRSTVWYZ', '#']);

function Rail({
  range,
  onJump,
}: Readonly<{ range: LetterRange; onJump: (letter: string) => void }>) {
  return (
    <AlphabetRail.Root label="Alphabetical navigation" range={range} onJump={onJump}>
      {LETTERS.map((letter) => (
        <AlphabetRail.Item
          key={letter}
          value={letter}
          disabled={!AVAILABLE.has(letter)}
          label={`Jump to ${letter}`}
        />
      ))}
    </AlphabetRail.Root>
  );
}

const spanFrom = (letter: string): LetterRange => {
  const at = LETTERS.indexOf(letter);
  return { first: letter, last: LETTERS[Math.min(at + 3, LETTERS.length - 1)] ?? letter };
};

export function Catalogue() {
  const [range, setRange] = useState(spanFrom('W'));
  return (
    <Box row gap={20} p={20} align="center">
      <Rail range={range} onJump={(letter) => setRange(spanFrom(letter))} />
      <Text variant="meta" color="textDim">
        Sections {range.first} to {range.last} on screen
      </Text>
    </Box>
  );
}

export function OneSection() {
  const [letter, setLetter] = useState('C');
  return (
    <Box row gap={20} align="center">
      <Rail range={{ first: letter, last: letter }} onJump={setLetter} />
      <Text variant="meta" color="textDim">
        Section {letter} on screen
      </Text>
    </Box>
  );
}
