import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { Disclosure } from './disclosure';

function Parts() {
  return (
    <Disclosure.Root defaultOpen>
      <Disclosure.Trigger>Advanced</Disclosure.Trigger>
      <Disclosure.Panel>
        <Field.Root label="Custom endpoint">
          <Field.Input placeholder="https://" />
          <Field.Hint>Leave empty for the default.</Field.Hint>
        </Field.Root>
      </Disclosure.Panel>
    </Disclosure.Root>
  );
}

export default story({
  name: 'Disclosure',
  group: 'Layout',
  docs: 'A collapsible section with a divider header - the "Advanced" tail of a form that most visits never need. The trigger is a button announcing its **expanded** state, so assistive tech hears what the chevron shows. Uncontrolled by default (`defaultOpen`); pass `open`/`onOpenChange` to own it.\n\nComposed: `Root` owns the open state, `Trigger` is the whole header row (one D-pad stop, with the chevron as a face) and `Panel` is the region it swaps in. The rule belongs to the `Trigger`, so a section written without one carries none.',
  usage: `<Disclosure.Root>
  <Disclosure.Trigger>Advanced</Disclosure.Trigger>
  <Disclosure.Panel>
    <Field.Root label="Custom endpoint">
      <Field.Input placeholder="https://" />
    </Field.Root>
  </Disclosure.Panel>
</Disclosure.Root>`,
  guidelines: {
    do: [
      'Put the rarely-needed tail of a form behind it, closed by default.',
      'Keep the title short and scannable - it reads as a section heading.',
    ],
    dont: [
      "Don't hide the form's primary fields in one - a closed section reads as absent.",
      "Don't nest disclosures; two levels of maybe is a navigation problem.",
    ],
  },
  matrix: false,
  width: 420,
  args: { title: 'Advanced', defaultOpen: true },
  controls: { title: 'text', defaultOpen: 'boolean' },
  render: ({ title, defaultOpen }) => (
    <Box gap={8}>
      <Text color="textMuted">Everyday fields sit above the fold.</Text>
      <Disclosure.Root key={String(defaultOpen)} defaultOpen={defaultOpen}>
        <Disclosure.Trigger>{title}</Disclosure.Trigger>
        <Field.Root label="Custom endpoint">
          <Field.Input placeholder="https://" />
          <Field.Hint>Leave empty for the default.</Field.Hint>
        </Field.Root>
      </Disclosure.Root>
    </Box>
  ),
  scenes: [
    {
      name: 'With its own panel',
      docs: 'A `Panel` written as a direct child IS the body, so nothing else needs wrapping.',
      example: () => <Parts />,
    },
  ],
});
