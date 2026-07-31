import { story } from '@kroma/workbench/story';
import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { Skeleton } from './skeleton';

function Labelled({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Box gap={6}>
      <Txt variant="overline" color="textDim">
        {label}
      </Txt>
      {children}
    </Box>
  );
}

export default story({
  name: 'Skeleton',
  group: 'State',
  docs: "The pulsing placeholder for content that is loading. It takes the same layout shorthands as Box, so it sizes exactly like what it replaces, and `shape` names the shapes that would otherwise be spelled out at every call site: a run of text lines on a type role's rhythm, a circle, and the two card ratios.",
  usage: `<Skeleton w={220} h={22} />                        // a block
<Skeleton shape="text" variant="meta" lines={3} />   // a paragraph
<Skeleton shape="circle" size={42} />                // an avatar
<Skeleton shape="poster" w={200} />                  // card art`,
  guidelines: {
    do: [
      'Give a text placeholder the same `variant` as the <Txt> it stands in for: the lines then occupy exactly the height the real text will.',
      'Reach for the layout shorthands (`mt`, `w`, `self`) rather than wrapping a skeleton in a spacer view.',
    ],
    dont: [
      "Don't animate one yourself - the pulse is shared, and a screenful of placeholders breathes together.",
      "Don't leave a skeleton up for a request that has already failed; a placeholder promises content is coming.",
    ],
  },
  matrix: false,
  args: { w: 220, h: 22 },
  controls: { w: { min: 40, max: 400, step: 20 }, h: { min: 8, max: 200, step: 4 } },
  render: (props) => (
    <Box gap={12}>
      <Skeleton {...props} />
      <Skeleton {...props} radius="pill" />
    </Box>
  ),
  scenes: [
    {
      name: 'Every shape',
      docs: 'A block, a paragraph, a circle, and the poster and still ratios.',
      render: () => (
        <Box row gap={32} align="flex-start">
          <Box gap={16} w={240}>
            <Labelled label="block">
              <Skeleton w={220} h={22} />
            </Labelled>
            <Labelled label="text">
              <Skeleton shape="text" variant="meta" lines={3} />
            </Labelled>
            <Labelled label="circle">
              <Skeleton shape="circle" size={42} />
            </Labelled>
          </Box>
          <Labelled label="poster">
            <Skeleton shape="poster" w={140} />
          </Labelled>
          <Labelled label="still">
            <Skeleton shape="still" w={240} />
          </Labelled>
        </Box>
      ),
    },
    {
      name: 'A poster rail, loading',
      docs: 'The shapes compose into the tile they stand in for: art, then a title and a meta line.',
      render: () => (
        <Box row gap={18}>
          {[0, 1, 2, 3].map((tile) => (
            <Box key={tile} gap={10} w={140}>
              <Skeleton shape="poster" />
              <Skeleton shape="text" variant="label" lines={2} />
            </Box>
          ))}
        </Box>
      ),
    },
  ],
});
