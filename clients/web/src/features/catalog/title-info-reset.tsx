import { Button, Field } from '@kromatv/ui/kit';

/** The button at the end of a field's label row that hands the field back to
 * the `.nfo` file or the provider, or nothing while there is nothing to hand
 * back. A direct child of the `Field.Root`. */
export function resetAction(label: string, onReset: (() => void) | null) {
  return onReset === null ? null : (
    <Field.Actions>
      <Button variant="ghost" size="sm" icon="arrow-back-up" label={label} onPress={onReset} />
    </Field.Actions>
  );
}
