import { defineControl, typed } from '#ui/lib/control';

/** What a `<LanguagePicker.Root>` holds: the language picked, whether its
 *  dialog is open, and what was typed to search the list. Opening the dialog
 *  starts the search afresh, and a pick closes it. */
const languagePickerControl = defineControl('languagePicker', {
  state: { value: typed<string | null>(null), open: false, query: '' },
  actions: {
    trigger: () => ({ open: true, query: '' }),
    select: (_now, code: string) => ({ value: code, open: false }),
  },
  reasons: ['select', 'outside', 'back'],
});

export { languagePickerControl };
