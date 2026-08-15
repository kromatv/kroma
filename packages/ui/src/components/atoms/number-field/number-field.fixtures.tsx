import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import { Field } from '#ui/components/molecules/field';

import { NumberField } from './number-field';

export function Demo({ min, max, step }: Readonly<{ min: number; max: number; step: number }>) {
  const [tokens, setTokens] = useState(2048);
  const [temperature, setTemperature] = useState(0.7);
  return (
    <Box gap={20}>
      <Field.Root label="Max tokens">
        <NumberField
          label="Max tokens"
          value={tokens}
          onValueChange={setTokens}
          min={min}
          max={max}
          step={step}
        />
        <Field.Hint>Committed on blur, clamped to the bounds.</Field.Hint>
      </Field.Root>
      <Field.Root label="Temperature">
        <NumberField
          label="Temperature"
          value={temperature}
          onValueChange={setTemperature}
          min={0}
          max={2}
          step={0.1}
        />
      </Field.Root>
      <Text variant="meta" color="textDim">
        committed: {tokens} · {temperature}
      </Text>
    </Box>
  );
}
