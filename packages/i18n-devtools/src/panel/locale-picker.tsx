import { Select } from '@kroma/ui/kit';
import { useLocales } from '../engine/use-locales';

export interface LocalePickerProps {
  /** The locale in force: the override, or the one the app resolved on its own
   *  while there is none. */
  locale: string;
  onLocale: (locale: string) => void;
}

const NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'code' });

function nameOf(code: string): string {
  return NAMES.of(code) ?? code;
}

/** The locale to render in: every locale the app ships, in a select, which is
 *  a list the panel does not have to grow to hold. */
export function LocalePicker({ locale, onLocale }: Readonly<LocalePickerProps>) {
  const locales = useLocales();
  return (
    <Select.Root label="Locale" placeholder={locale} value={locale} onValueChange={onLocale}>
      <Select.Trigger size="sm" block />
      {locales.map((code) => (
        <Select.Item key={code} value={code} note={code.toUpperCase()}>
          {nameOf(code)}
        </Select.Item>
      ))}
    </Select.Root>
  );
}
