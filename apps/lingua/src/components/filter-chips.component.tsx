import { Row } from '@kromatv/ui/kit/atoms/box';
import { Chip } from '@kromatv/ui/kit/atoms/chip';
import { type FilterChoice, shownFilters } from '#site/lib/filter-choices';

/** A row of filters that count what each lists; the one in force is pressed, and a filter listing nothing is left out unless it is. */
export function FilterChips<F extends string>({
  label,
  choices,
  value,
  onValueChange,
}: Readonly<{
  label: string;
  choices: readonly FilterChoice<F>[];
  value: F;
  onValueChange: (next: F) => void;
}>) {
  return (
    <Row gap={8} wrap align="center" shrink={1} minW={0} role="group" aria-label={label}>
      {shownFilters(choices, value).map((choice) => (
        <Chip
          key={choice.value}
          label={choice.label}
          count={choice.count}
          dot={choice.dot}
          active={choice.value === value}
          onPress={() => onValueChange(choice.value)}
        />
      ))}
    </Row>
  );
}
