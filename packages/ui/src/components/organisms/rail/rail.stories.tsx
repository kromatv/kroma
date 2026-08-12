import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { MediaCard } from '#ui/components/molecules/media-card';
import { stillArt } from '#ui/lib/sample-art';
import { Rail } from './rail';

const TINT = ['#3A2E4F', '#1B1524'] as const;

function SelectableRail({
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

export default story({
  name: 'Rail',
  group: 'Media',
  docs: 'A horizontal scrolling row. `<Rail.Root>` holds a `<Rail.Title>` and the tiles; plain tile children get the growing row, which mounts a screenful and grows as focus nears its end. `<Rail.List>` is the windowed row for a long strip of uniform tiles: given a tile PITCH it runs on `<VirtualRail>`, so the row holds still while the highlight travels and moves only when the selection comes within a tile of either end, a SIDEWAYS wheel pans it without changing the selection (a vertical one is left to the page), and a pointer gets an arrow at each end. Rows whose tiles are not all one width (chips, cast faces) stay on the growing row.',
  usage: `<Rail.Root>
  <Rail.Title>Continue watching</Rail.Title>
  {cards}
</Rail.Root>

<Rail.Root>
  <Rail.Title variant="subheadingTv">Continue watching</Rail.Title>
  <Rail.List pitch={320 + RAIL_GAP} height={180}>
    {cards}
  </Rail.List>
</Rail.Root>`,
  guidelines: {
    do: [
      'Reach for `<Rail.List>` once a row can run past a couple of screens; it is the one that costs a screenful whatever its length.',
      'Pass `grow={false}` on a short strip of controls, so it does not open showing only its first chunk.',
    ],
    dont: [
      "Don't style the heading through the Root - `<Rail.Title>` takes its own `variant` and `style`.",
      "Don't put a `<Rail.List>` and loose tiles in the same Root: the list IS the row.",
    ],
  },
  matrix: false,
  width: { min: 560, max: 1400 },
  component: SelectableRail,
  args: { title: 'Continue watching', gap: 24, inset: 0, count: 24, virtualised: true },
  controls: { gap: { min: 8, max: 48, step: 4 }, count: { min: 1, max: 40, step: 1 } },
});
