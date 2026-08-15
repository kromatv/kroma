import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import { Radio } from './radio';

export const MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'direct', label: 'Direct play' },
  { value: 'transcode', label: 'Transcode' },
];

export function Demo({ size }: Readonly<{ size?: 'sm' | 'tv' }>) {
  const [mode, setMode] = useState('auto');
  return (
    <Box gap={14} role="radiogroup" accessibilityLabel="Playback mode">
      {MODES.map((m) => (
        <Box key={m.value} row align="center" gap={10}>
          <Radio
            size={size}
            label={m.label}
            checked={mode === m.value}
            onValueChange={() => setMode(m.value)}
          />
          <Text variant="body" color={mode === m.value ? 'text' : 'textMuted'}>
            {m.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
