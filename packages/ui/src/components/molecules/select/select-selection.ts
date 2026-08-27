import { useMemo } from 'react';
import { useStableCallback } from '#ui/lib/stable-callback';
import { useControllable } from '#ui/lib/use-controllable';
import type { SelectOption, SelectValueDetails } from './select-context';

const NONE: readonly string[] = [];

interface SelectSingleValueProps {
  multiple?: false;
  /** '' is "nothing picked": no option may use it, or the placeholder never
   *  shows. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string, details: SelectValueDetails) => void;
}

interface SelectMultipleValueProps {
  /** Every pick toggles a value and the surface stays open. */
  multiple: true;
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (next: string[], details: SelectValueDetails) => void;
}

type SelectValueProps = SelectSingleValueProps | SelectMultipleValueProps;

interface SelectSelection {
  values: readonly string[];
  choose: (value: string, item: SelectOption | undefined) => void;
}

function listOf(value: string | readonly string[]): readonly string[] {
  if (typeof value !== 'string') return value;
  return value === '' ? NONE : [value];
}

function toggled(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

function report(
  props: Readonly<SelectValueProps>,
  next: readonly string[],
  item: SelectOption,
): void {
  if (props.multiple) props.onValueChange?.([...next], { item });
  else props.onValueChange?.(next[0] ?? '', { item });
}

function useSelectSelection(props: Readonly<SelectValueProps>): SelectSelection {
  const controlled = props.value;
  const incoming = useMemo(
    () => (controlled === undefined ? undefined : listOf(controlled)),
    [controlled],
  );
  const [values, setValues] = useControllable(incoming, listOf(props.defaultValue ?? NONE));

  const choose = useStableCallback((value: string, item: SelectOption | undefined) => {
    const next = props.multiple ? toggled(values, value) : [value];
    setValues(next);
    if (item) report(props, next, item);
  });

  return { values, choose };
}

export type { SelectMultipleValueProps, SelectSingleValueProps, SelectValueProps };
export { useSelectSelection };
