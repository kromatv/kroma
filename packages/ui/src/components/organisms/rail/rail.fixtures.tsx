import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import { MediaCard } from '#ui/components/molecules/media-card';

import { stillArt } from '#ui/lib/sample-art';

import { Rail } from './rail';

export const TINT = ['#3A2E4F', '#1B1524'] as const;

export function SelectableRail({
  title,
  count,
  virtualised,
  gap,
  inset,
}: Readonly<{
  title: string;
  count: number;
  virtualised: boolean;
  gap: number;
  inset: number;
}>) {
  const [picked, setPicked] = useState<string | null>(null);
  const cards = Array.from({ length: count }, (_, index) => `Title ${index + 1}`).map(
    (name, index) => (
      <MediaCard
        key={name}
        title={name}
        overline="Science fiction"
        art={stillArt(index)}
        tint={TINT}
        progress={index === 0 ? 0.35 : null}
        watched={index === 1}
        onPress={() => setPicked(name)}
      />
    ),
  );
  return (
    <Box gap={14}>
      {virtualised ? (
        // The row is a part, so the windowed one is named rather than switched
        // on by a prop.
        <Rail.Root gap={gap} inset={inset}>
          <Rail.Title variant="subheadingTv">{title}</Rail.Title>
          {/* The pitch is the tile width PLUS the gap after it. */}
          <Rail.List pitch={320 + gap} height={180}>
            {cards}
          </Rail.List>
        </Rail.Root>
      ) : (
        <Rail.Root gap={gap} inset={inset}>
          <Rail.Title>{title}</Rail.Title>
          {cards}
        </Rail.Root>
      )}
      <Text variant="meta" color="textDim">
        {picked ? `Selected: ${picked}` : 'Select a tile - remote, tap or click.'}
      </Text>
    </Box>
  );
}
