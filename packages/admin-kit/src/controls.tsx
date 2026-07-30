// Generic, reusable admin controls: segmented control, number field, button,
// icon button, and a collapsible disclosure.
import { IconChevronDown, IconLoader2, type TablerIcon } from '@tabler/icons-react';
import { type ComponentPropsWithoutRef, forwardRef, type ReactNode, useState } from 'react';
import { FIELD } from './field';

/** A pill segmented control: one selected option among a few, each with an
 * optional sub-label. Generic over the value union. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: Readonly<{
  value: T;
  options: { value: T; label: string; desc?: string }[];
  onChange: (v: T) => void;
}>) {
  return (
    <div className="inline-flex gap-1 rounded-[11px] border border-border-strong bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`rounded-[8px] px-3.5 py-2 text-left transition-colors ${active ? 'bg-accent-soft' : 'hover:bg-white/5'}`}
          >
            <span
              className={`block text-[13px] font-semibold ${active ? 'text-accent' : 'text-text/75'}`}
            >
              {o.label}
            </span>
            {o.desc ? <span className="block text-[11px] text-dim">{o.desc}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** A compact numeric input. */
export function NumberField({
  value,
  step,
  min,
  max,
  onChange,
}: Readonly<{
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}>) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        // A blank field is `Number('') === 0`, which would silently commit 0 and
        // bypass `min` (e.g. clearing Max tokens to retype -> max_tokens:0). Ignore
        // empty/NaN; only commit a real number.
        const raw = e.target.value.trim();
        if (raw === '') return;
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(n);
      }}
      className={`${FIELD} w-32`}
    />
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-surface-2 text-text hover:border-accent/50',
  danger: 'border border-[#E8536A]/25 bg-[#E8536A]/10 text-[#E8536A]',
  quiet: 'text-muted hover:text-text',
};

const SIZE: Record<Size, string> = {
  md: 'gap-2 rounded-md px-4 py-2.5 text-[13.5px] font-bold',
  sm: 'gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold',
};

const ICON_SIZE: Record<Size, number> = { md: 16, sm: 14 };

/** A button with a variant + size + optional leading icon. `loading` swaps the
 * icon slot for a spinner and disables the button while the action runs. */
export function Button({
  label,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  loading,
  icon: Icon,
  type = 'button',
  className = '',
}: Readonly<{
  label: string;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: TablerIcon;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}>) {
  const iconSize = ICON_SIZE[size];
  let leading: ReactNode = null;
  if (loading) leading = <IconLoader2 size={iconSize} stroke={2.4} className="animate-spin" />;
  else if (Icon) leading = <Icon size={iconSize} stroke={2.2} />;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center transition-colors disabled:opacity-50 ${SIZE[size]} ${VARIANT[variant]} ${className}`}
    >
      {leading}
      {label}
    </button>
  );
}

type IconButtonVariant = 'secondary' | 'ghost' | 'danger';

const ICON_BUTTON_VARIANT: Record<IconButtonVariant, string> = {
  secondary: 'border border-white/12 bg-[#1A1A20] text-white/70 hover:text-white',
  ghost: 'text-white/70 hover:bg-white/6 hover:text-white',
  danger: 'border border-[#E8536A]/25 bg-[#E8536A]/10 text-[#E8536A] hover:bg-[#E8536A]/20',
};

export interface IconButtonProps
  extends Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'aria-label'> {
  icon: TablerIcon;
  label: string;
  size?: number;
  iconSize?: number;
  variant?: IconButtonVariant;
}

/** A square icon-only button. Forwards its ref + spreads native button props so
 * it works as a Radix `asChild` trigger (dropdowns, tooltips, ...). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon: Icon,
    label,
    size = 34,
    iconSize,
    variant = 'secondary',
    className = '',
    style,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      style={{ width: size, height: size, ...style }}
      className={`flex shrink-0 items-center justify-center rounded-lg outline-none transition-colors disabled:opacity-50 ${ICON_BUTTON_VARIANT[variant]} ${className}`}
      {...rest}
    >
      <Icon size={iconSize ?? Math.round(size * 0.42)} stroke={2} />
    </button>
  );
});

/** A collapsible section with a divider header (e.g. "Advanced"). */
export function Disclosure({
  title,
  defaultOpen = false,
  children,
}: Readonly<{ title: string; defaultOpen?: boolean; children: ReactNode }>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mt-4.5 border-t border-border pt-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="text-[15px] font-bold uppercase tracking-wider text-text">{title}</span>
        <IconChevronDown
          size={18}
          stroke={2}
          className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? <div className="mt-4.5">{children}</div> : null}
    </section>
  );
}
