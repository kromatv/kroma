import { defineControl, typed } from '#ui/lib/control';

const NONE: readonly string[] = [];

const toggled = (values: readonly string[], value: string): readonly string[] =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

const only = (values: readonly string[], value: string): readonly string[] =>
  values.length === 1 && values[0] === value ? values : [value];

/** The open state and the picked values of a `<Select.Root>`, a single
 *  select's value held as a list of one. */
const selectControl = defineControl('select', {
  state: { open: false, value: typed<readonly string[]>(NONE) },
  options: { multiple: false },
  actions: {
    trigger: () => ({ open: true }),
    select: ({ value: values, multiple }, value: string) =>
      multiple ? { value: toggled(values, value) } : { value: only(values, value), open: false },
  },
  reasons: ['select', 'outside', 'escape', 'back'],
});

export { NONE, selectControl };
