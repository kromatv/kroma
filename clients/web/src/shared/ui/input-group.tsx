// A small shadcn-style InputGroup: an icon/button addon + an input share one
// bordered "field", and the FOCUS state lives on the group (the accent border
// and the field ring via `focus-within`), not on the raw input. The inner
// control opts out of the app's field ring (see clients/web/src/styles.css) so
// the ring lands on the box the user sees rather than inside it.

import type { InputHTMLAttributes, ReactNode } from 'react';

/** The bordered field wrapper. Owns the focus visual for its controls. */
export function InputGroup({
  children,
  className = '',
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      className={`flex items-center gap-2 rounded-[9px] border border-border-strong bg-surface-2 px-3 transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

/** An icon / text / button sitting inside the field, before or after the input. */
export function InputGroupAddon({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="flex shrink-0 items-center text-muted">{children}</span>;
}

/** The input itself: transparent, borderless, and ringless - the group above
 *  draws the focus, so this one opts out of the app's field ring. */
export function InputGroupInput({
  className = '',
  ...rest
}: Readonly<InputHTMLAttributes<HTMLInputElement>>) {
  return (
    <input
      {...rest}
      data-focus-ring="off"
      className={`w-full min-w-0 bg-transparent py-2 text-[13px] text-text outline-none placeholder:text-muted ${className}`}
    />
  );
}
