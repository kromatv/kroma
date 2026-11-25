import { type ChangeDetails, defineControl, type ReasonOf } from '#ui/lib/control';

/** The name a <Combobox.Root> holds and whether its suggestions are open.
 *  What is typed is the value; a pick replaces it and closes the list. */
const comboboxControl = defineControl('combobox', {
  state: { value: '', open: false },
  actions: {
    type: (_now, text: string) => ({ value: text, open: true }),
    pick: (_now, name: string) => ({ value: name, open: false }),
  },
  reasons: ['trigger', 'commit', 'outside', 'escape', 'back'],
});

/** Why the value or the list moved: `type`, `pick`, `commit` for Enter
 *  keeping what is typed, `trigger`, `outside`, `escape`, `back` (the
 *  remote's Back button), or `set` for a setter called without a reason. */
type ComboboxReason = ReasonOf<typeof comboboxControl>;

type ComboboxDetails = ChangeDetails<ComboboxReason>;

export type { ComboboxDetails, ComboboxReason };
export { comboboxControl };
