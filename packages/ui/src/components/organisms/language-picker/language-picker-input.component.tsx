import { Field } from '#ui/components/molecules/field';
import { useTDefault } from '#ui/services/i18n';
import { useLanguagePicker } from './language-picker-context';

/** The search over a long list, by either name or the code, whatever the case
 *  and the accents. Drawn only where there is a keyboard to type with and a
 *  list long enough to need it: a remote scrolls the list instead. */
function Input() {
  const t = useTDefault();
  const { searchable, query, setQuery, size } = useLanguagePicker('Input');
  if (!searchable) {
    return null;
  }
  const label = t('common.languageSearch');
  return (
    <Field.Root size={size} label={label} hideLabel>
      <Field.Input
        type="search"
        icon="search"
        placeholder={label}
        value={query}
        onValueChange={(next) => setQuery(next)}
      />
    </Field.Root>
  );
}

export { Input };
