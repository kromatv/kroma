import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { StatusDot } from './status-dot';

export default story({
  name: 'StatusDot',
  group: 'Feedback',
  docs: 'Reachability, as one lit dot. Three states, not two: green up, red down, and grey while the first probe is still out — *unknown* has to look different from *down* on a list of servers you are picking from. `overArt` adds the dark ring the dot needs when it sits on a hero still rather than on a surface.',
  usage: `<StatusDot online={probe?.online} />
<StatusDot online overArt />   // on the top bar, over artwork`,
  guidelines: {
    do: [
      'Pass `undefined` while the probe is out; the grey state exists for exactly that.',
      'Pair it with a word when the answer needs a number (the round-trip, "Unreachable").',
    ],
    dont: [
      "Don't colour it green optimistically before an answer - the dot is a measurement.",
      "Don't grow it past ~12pt; a status dot that big reads as a bullet.",
    ],
  },
  matrix: false,
  args: { online: true, size: 10, overArt: false },
  controls: { size: { min: 6, max: 16, step: 1 } },
  render: (props) => <StatusDot {...props} />,
  scenes: [
    {
      name: 'Every state',
      docs: 'Up, down, and not-yet-probed.',
      render: ({ size, overArt }) => (
        <Box row align="center" gap={28}>
          {[
            { label: 'Up', online: true },
            { label: 'Down', online: false },
            { label: 'Probing', online: undefined },
          ].map((s) => (
            <Box key={s.label} row align="center" gap={8}>
              <StatusDot online={s.online} size={size} overArt={overArt} />
              <Text variant="meta" color="textDim">
                {s.label}
              </Text>
            </Box>
          ))}
        </Box>
      ),
    },
  ],
});
