import { IconButton } from '#ui/components/atoms/icon-button';
import { Field } from '#ui/components/molecules/field';

export interface ModuleSearchProps {
  value: string;
  onChange: (next: string) => void;
}

/** The catalog filter: name, id and description, over the loaded list. */
export function ModuleSearch({ value, onChange }: Readonly<ModuleSearchProps>) {
  return (
    <Field
      label="Search modules"
      hideLabel
      type="search"
      icon="search"
      placeholder="Name, id or description"
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
