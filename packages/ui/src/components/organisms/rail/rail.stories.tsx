import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { MediaCard } from '#ui/components/molecules/media-card';
import { stillArt } from '#ui/lib/sample-art';
import { Rail } from './rail';

const TINT = ['#3A2E4F', '#1B1524'] as const;

function SelectableRail({
  count,
  virtualised,
  gap,
  ...props
}: Readonly<{
  title: string;
  count: number;
  virtualised: boolean;
  gap: number;
  inset: number;
}>) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Box gap={14}>
      <Rail
        {...props}
        gap={gap}
        // The pitch is the tile width PLUS the gap after it.
        item={virtualised ? { width: 320 + gap, height: 180 } : undefined}
      >
        {Array.from({ length: count }, (_, index) => `Title ${index + 1}`).map((title, index) => (
          <MediaCard
            key={title}
            title={title}
            overline="Science fiction"
            art={stillArt(index)}
            tint={TINT}
            progress={index === 0 ? 0.35 : null}
            watched={index === 1}
            onPress={() => setPicked(title)}
          />
        ))}
      </Rail>
      <Txt variant="meta" color="textDim">
        {picked ? `Selected: ${picked}` : 'Select a tile - remote, tap or click.'}
      </Txt>
    </Box>
  );
}

export default story({
  name: 'Rail',
  group: 'Media',
  docs: 'A horizontal scrolling row. Given a tile PITCH (`item`) it runs on `<VirtualRail>`: the row holds still while the highlight travels and moves only when the selection comes within a tile of either end, a SIDEWAYS wheel pans it without changing the selection (a vertical one is left to the page), and a pointer gets an arrow at each end. Without a pitch it falls back to the growing rail, which is for rows whose tiles are not all one width (chips, cast faces).',
  matrix: false,
  width: { min: 560, max: 1400 },
  args: { title: 'Continue watching', gap: 24, inset: 0, count: 24, virtualised: true },
  controls: { gap: { min: 8, max: 48, step: 4 }, count: { min: 1, max: 40, step: 1 } },
  render: (args) => <SelectableRail {...args} />,
});
