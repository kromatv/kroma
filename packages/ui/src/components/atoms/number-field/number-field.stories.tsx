import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { NumberField } from './number-field';

function Demo({ min, max, step }: Readonly<{ min: number; max: number; step: number }>) {
  const [tokens, setTokens] = useState(2048);
  const [temperature, setTemperature] = useState(0.7);
  return (
    <Box gap={20}>
      <Field.Root label="Max tokens">
        <NumberField
          label="Max tokens"
          value={tokens}
          onChange={setTokens}
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
          onChange={setTemperature}
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

export default story({
  name: 'NumberField',
  group: 'Input',
  docs: "The numeric entry, worn inside a <Field.Root> like any other: the same well, the same rhythm, plus a stacked **stepper pair** - the pointer's way to nudge, the arrow keys' twin on a physical keyboard, and on a television the only way to change the value at all. The buffer is text (a cleared field can be retyped in peace), only a real number is ever committed, and blur clamps to `min`/`max` and rewrites the text to the number actually stored - the field can never show one value while holding another.",
  usage: `<Field.Root label="Max tokens">
  <NumberField label="Max tokens" value={maxTokens} onChange={setMaxTokens} min={64} step={256} />
  <Field.Hint>64 to 8192</Field.Hint>
</Field.Root>`,
  guidelines: {
    do: [
      'Wrap it in a <Field.Root> for the label row; its own `label` stays the accessible name.',
      'State `min`/`max` when the server would reject values outside them - the steppers grey out at the bounds.',
      "Pick a `step` that matches the value's grain: 0.1 for a temperature, 256 for a token budget.",
    ],
    dont: ["Don't use it for a bounded handful of values - that is a <SegmentedControl>."],
  },
  matrix: false,
  width: 340,
  component: Demo,
  args: { min: 64, max: 8192, step: 256 },
  controls: { min: 'number', max: 'number', step: 'number' },
});
