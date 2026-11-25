import { type EnclosingField, useEnclosingField } from '#ui/components/molecules/field';
import type { ControlSize } from '#ui/lib/field-shell';

interface EntryOwnProps {
  label?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  size?: ControlSize;
}

interface Enclosed {
  label: string;
  invalid: boolean;
  disabled: boolean;
  size: ControlSize | undefined;
  onFocusChange: (focused: boolean) => void;
}

/** An entry's props with what it takes from the <Field.Root> around it. */
type EnclosedEntry<P> = Omit<P, keyof Enclosed> & Enclosed;

const IGNORE_FOCUS = () => undefined;

function labelOf(props: Readonly<EntryOwnProps>, field: EnclosingField | null): string {
  return props.label ?? field?.label ?? props.placeholder ?? '';
}

function invalidOf(props: Readonly<EntryOwnProps>, field: EnclosingField | null): boolean {
  return props.invalid ?? field?.invalid ?? false;
}

/** An entry's props, completed from the <Field.Root> around it: its label
 *  (then the placeholder), its error and its size, and the focus it lights. */
function useEnclosedEntry<P extends EntryOwnProps>(props: Readonly<P>): EnclosedEntry<P> {
  const field = useEnclosingField();
  return {
    ...props,
    label: labelOf(props, field),
    invalid: invalidOf(props, field),
    disabled: props.disabled ?? false,
    size: props.size ?? field?.size,
    onFocusChange: field?.setFocused ?? IGNORE_FOCUS,
  };
}

export type { EnclosedEntry };
export { useEnclosedEntry };
