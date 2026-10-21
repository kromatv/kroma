import { Field } from '@kromatv/ui/kit';
import { useState } from 'react';

export function EditableText({
  label,
  value,
  onCommit,
}: Readonly<{ label: string; value: string; onCommit: (v: string) => void }>) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setV(value);
  }
  return (
    <Field.Root label={label} hideLabel value={v} onValueChange={setV}>
      <Field.Input
        minW={200}
        onBlur={() => {
          if (v !== value) onCommit(v);
        }}
      />
    </Field.Root>
  );
}
