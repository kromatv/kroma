import { styles, useStyles } from '@kromatv/ui/kit';
import { TextField } from '@kromatv/ui/kit/atoms/text-field';

const sDefinition = styles({ entry: { font: 'ui' } });

/** A search box in Lingua's type: the kit's field, its text in the UI face rather than the browser's. */
export function SearchField({
  label,
  placeholder,
  value,
  onValueChange,
  autoFocus = false,
}: Readonly<{
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (next: string) => void;
  autoFocus?: boolean;
}>) {
  const s = useStyles(sDefinition);
  return (
    <TextField
      type="search"
      icon="search"
      size="sm"
      label={label}
      placeholder={placeholder}
      value={value}
      onValueChange={onValueChange}
      autoFocus={autoFocus}
      textStyle={s.entry}
    />
  );
}
