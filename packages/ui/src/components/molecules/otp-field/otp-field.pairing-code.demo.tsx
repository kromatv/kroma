import { OtpField, REGEXP_ONLY_DIGITS_AND_CHARS } from './otp-field';

/**
 * The other direction: a code the television DISPLAYS for a phone to type. It is
 * read off the screen rather than entered into it, so it is alphanumeric,
 * 10-foot sized, never masked, and carries no caret.
 *
 * @name Pairing code
 */
export default function PairingCode() {
  return <OtpField maxLength={4} size="tv" pattern={REGEXP_ONLY_DIGITS_AND_CHARS} value="K7F2" />;
}
