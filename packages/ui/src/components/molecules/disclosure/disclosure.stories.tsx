import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { Disclosure } from './disclosure';

export default story({
  name: 'Disclosure',
  group: 'Layout',
  docs: 'A collapsible section with a divider header - the "Advanced" tail of a form that most visits never need. The header is a button announcing its **expanded** state, so assistive tech hears what the chevron shows. Uncontrolled by default (`defaultOpen`); pass `open`/`onOpenChange` to own it.',
  usage: `<Disclosure title="Advanced">
  <Field.Root label="Custom endpoint">
    <Field.Input placeholder="https://" />
  </Field.Root>
</Disclosure>`,
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
      <Disclosure key={String(defaultOpen)} title={title} defaultOpen={defaultOpen}>
        <Field.Root label="Custom endpoint" hint="Leave empty for the default.">
          <Field.Input placeholder="https://" />
        </Field.Root>
      </Disclosure>
    </Box>
  ),
});
