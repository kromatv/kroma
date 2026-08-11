import { IconButton } from '#ui/components/atoms/icon-button';
import { Field } from '#ui/components/molecules/field';

export interface ReleaseSearchProps {
  value: string;
  onChange: (next: string) => void;
}

export function ReleaseSearch({ value, onChange }: Readonly<ReleaseSearchProps>) {
  return (
    <Field
      label="Search releases"
      hideLabel
      type="search"
      icon="search"
      placeholder="Version, channel or date"
      value={value}
      onChange={onChange}
      trailing={
        value ? (
          <IconButton
            variant="ghost"
            size={24}
            glyph={16}
            icon="x"
            label="Clear search"
            onPress={() => onChange('')}
          />
        ) : null
      }
      grow={1}
      shrink={1}
      basis={280}
      minW={0}
      maxW={420}
    />
  );
}
