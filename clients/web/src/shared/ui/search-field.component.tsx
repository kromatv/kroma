import { type ControlSize, Field } from '@kromatv/ui/kit';

interface SearchFieldProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  size?: ControlSize;
}

/** A search box whose label is read out and shown as its placeholder, with no
 * line of its own above it. */
export function SearchField({ label, value, onValueChange, size }: Readonly<SearchFieldProps>) {
  return (
    <Field.Root size={size} label={label} hideLabel>
      <Field.Input
        type="search"
        icon="search"
        placeholder={label}
        value={value}
        onValueChange={onValueChange}
      />
    </Field.Root>
  );
}
