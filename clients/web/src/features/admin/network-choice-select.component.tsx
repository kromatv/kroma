import { Select } from '@kromatv/ui/kit';

const ANY = '*';

interface ChoiceSelectProps {
  label: string;
  anyLabel: string;
  value: string | null;
  choices: readonly string[];
  onValueChange: (value: string | null) => void;
  nameOf?: (choice: string) => string;
  block?: boolean;
}

function asIs(choice: string): string {
  return choice;
}

export function ChoiceSelect({
  label,
  anyLabel,
  value,
  choices,
  onValueChange,
  nameOf = asIs,
  block = false,
}: Readonly<ChoiceSelectProps>) {
  return (
    <Select.Root
      label={label}
      value={value ?? ANY}
      onValueChange={(next) => onValueChange(next === ANY ? null : next)}
    >
      <Select.Trigger block={block} />
      <Select.Item value={ANY} label={anyLabel} />
      {choices.map((choice) => (
        <Select.Item key={choice} value={choice} label={nameOf(choice)} />
      ))}
    </Select.Root>
  );
}
