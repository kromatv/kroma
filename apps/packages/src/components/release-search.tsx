import { IconButton } from '@kroma/ui/kit/atoms/icon-button';
import { Field } from '@kroma/ui/kit/molecules/field';

export interface ReleaseSearchProps {
  value: string;
  onChange: (next: string) => void;
}

export function ReleaseSearch({ value, onChange }: Readonly<ReleaseSearchProps>) {
  return (
    <Field.Root
      label="Search releases"
      hideLabel
      grow={1}
      shrink={1}
      basis={280}
      minW={0}
      maxW={420}
    >
      <Field.Input
        type="search"
        icon="search"
        placeholder="Version, channel or date"
        value={value}
        onValueChange={onChange}
        trailing={
          value ? (
            <IconButton
              variant="ghost"
              diameter={24}
              glyph={16}
              icon="x"
              label="Clear search"
              onPress={() => onChange('')}
            />
          ) : null
        }
      />
    </Field.Root>
  );
}
