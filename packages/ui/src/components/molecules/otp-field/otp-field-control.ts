import { defineControl } from '#ui/lib/control';

const REGEXP_ONLY_DIGITS = String.raw`^\d+$`;
const REGEXP_ONLY_CHARS = '^[a-zA-Z]+$';
const REGEXP_ONLY_DIGITS_AND_CHARS = '^[a-zA-Z0-9]+$';

function allowedOf(text: string, pattern: string, maxLength: number): string {
  const allowed = new RegExp(pattern);
  return Array.from(text)
    .filter((char) => allowed.test(char))
    .slice(0, maxLength)
    .join('');
}

const otpFieldControl = defineControl('otp-field', {
  state: { value: '' },
  options: { maxLength: 6, pattern: REGEXP_ONLY_DIGITS, disabled: false },
  actions: {
    type: ({ maxLength, pattern, disabled }, text: string) =>
      disabled ? {} : { value: allowedOf(text, pattern, maxLength) },
  },
});

export { otpFieldControl, REGEXP_ONLY_CHARS, REGEXP_ONLY_DIGITS, REGEXP_ONLY_DIGITS_AND_CHARS };
