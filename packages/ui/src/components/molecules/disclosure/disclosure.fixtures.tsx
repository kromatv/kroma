import { Field } from '#ui/components/molecules/field';

import { Disclosure } from './disclosure';

export function Parts() {
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
