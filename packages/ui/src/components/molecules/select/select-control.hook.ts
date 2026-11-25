import { useLayoutEffect, useMemo, useRef } from 'react';
import { type ChangeDetails, type ControlOf, useControl } from '#ui/lib/control';
import { useStableCallback } from '#ui/lib/stable-callback.hook';
import type {
  SelectOpenDetails,
  SelectOpenReason,
  SelectOption,
  SelectValueDetails,
} from './select-context';
import { NONE, selectControl } from './select-control';

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

type SelectControlProps = SelectValueProps & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: SelectOpenDetails) => void;
  disabled?: boolean;
};

function listOf(value: string | readonly string[]): readonly string[] {
  if (typeof value !== 'string') {
    return value;
  }
  return value === '' ? NONE : [value];
}

const moved = (before: readonly string[], after: readonly string[]): string | undefined =>
  after.find((value) => !before.includes(value)) ?? before.find((value) => !after.includes(value));

const withItem = (
  details: ChangeDetails<SelectOpenReason>,
  item: SelectOption,
): SelectValueDetails => ({
  reason: details.reason,
  source: details.source,
  get canceled() {
    return details.canceled;
  },
  cancel: details.cancel,
  item,
});

function report(
  props: Readonly<SelectValueProps>,
  next: readonly string[],
  details: SelectValueDetails,
): void {
  if (props.multiple) {
    props.onValueChange?.([...next], details);
  } else {
    props.onValueChange?.(next[0] ?? '', details);
  }
}

function useValueReport(props: Readonly<SelectValueProps>, options: readonly SelectOption[]) {
  const heldRef = useRef(NONE);
  const onValueChange = useStableCallback(
    (next: readonly string[], details: ChangeDetails<SelectOpenReason>) => {
      const changed = moved(heldRef.current, next);
      const item = options.find((option) => option.value === changed);
      if (item) {
        report(props, next, withItem(details, item));
      }
    },
  );
  return { heldRef, onValueChange };
}

function useSelectControl(
  props: Readonly<SelectControlProps>,
  options: readonly SelectOption[],
): ControlOf<typeof selectControl> {
  const { heldRef, onValueChange } = useValueReport(props, options);
  const value = useMemo(
    () => (props.value === undefined ? undefined : listOf(props.value)),
    [props.value],
  );
  const defaultValue = listOf(props.defaultValue ?? NONE);
  const [control] = useControl(selectControl, { ...props, value, defaultValue, onValueChange });
  useLayoutEffect(() => {
    heldRef.current = control.value;
  });
  return control;
}

export type { SelectMultipleValueProps, SelectSingleValueProps, SelectValueProps };
export { useSelectControl };
