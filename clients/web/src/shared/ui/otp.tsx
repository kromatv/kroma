// A styled one-time-code / PIN input built on `input-otp`: a row of individual
// digit slots with an animated caret, matching the KROMA design. Used for the
// profile PIN (masked) and Quick Connect codes (plain).

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from 'input-otp';
import { useMemo } from 'react';

export interface OtpProps {
  value: string;
  onChange: (value: string) => void;
  /** Number of slots (digits). Defaults to 4. */
  length?: number;
  /** Fired once every slot is filled great for auto-submit. */
  onComplete?: (value: string) => void;
  /** Render dots instead of the digits (for a secret PIN). */
  mask?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
}

export function Otp({
  value,
  onChange,
  length = 4,
  onComplete,
  mask,
  disabled,
  autoFocus,
  ariaLabel,
}: Readonly<OtpProps>) {
  // Keys for the fixed positional slot row. Derived from the position, NOT from
  // crypto.randomUUID(): that is only defined in a SECURE CONTEXT, and a
  // self-hosted server is normally reached over plain http on a LAN address
  // (http://192.168.x.x:4040), where it is undefined and throws
  // "crypto.randomUUID is not a function" - taking the whole login screen down
  // with it, which is the one screen nobody can route around.
  //
  // A position is the right key here anyway. These slots never reorder or get
  // inserted into; slot 0 is always slot 0, so its index IS its identity.
  const slotKeys = useMemo(
    () => Array.from({ length }, (_, index) => `otp-slot-${index}`),
    [length],
  );
  return (
    <OTPInput
      maxLength={length}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      inputMode="numeric"
      pattern={REGEXP_ONLY_DIGITS}
      aria-label={ariaLabel}
      autoComplete="one-time-code"
      containerClassName="flex items-center gap-3 has-disabled:opacity-50"
      render={({ slots }) => (
        <>
          {slots.map((slot, i) => (
            <Slot key={slotKeys[i]} {...slot} mask={mask} />
          ))}
        </>
      )}
    />
  );
}

function Slot({ char, isActive, hasFakeCaret, mask }: Readonly<SlotProps & { mask?: boolean }>) {
  return (
    <div
      className={`relative flex h-15 w-13 items-center justify-center rounded-xl border text-[26px] font-semibold text-text transition-colors ${
        isActive ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface-2'
      }`}
    >
      {char != null ? <span>{mask ? '•' : char}</span> : null}
      {hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-7 w-px animate-[otp-caret_1s_ease-in-out_infinite] bg-accent" />
        </div>
      ) : null}
    </div>
  );
}
