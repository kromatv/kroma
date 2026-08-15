import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import { Kbd } from './kbd';

export function Chord({ keys, label }: Readonly<{ keys: readonly string[]; label: string }>) {
  return (
    <Box row align="center" gap={5}>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <Text variant="meta" color="textDim">
        {label}
      </Text>
    </Box>
  );
}
