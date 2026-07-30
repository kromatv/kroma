// A styled one-time-code / PIN input built on `input-otp`, used for the profile PIN
// (masked) and Quick Connect codes (plain).

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from 'input-otp';
import { useMemo } from 'react';

export interface OtpProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  onComplete?: (value: string) => void;
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
  // Positional keys, NOT crypto.randomUUID(): that only exists in a secure context,
  // and a self-hosted server is normally reached over plain http on a LAN address,
  // where it throws and takes the login screen down.
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
