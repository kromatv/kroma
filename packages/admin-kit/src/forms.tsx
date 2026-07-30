// Form + modal primitives for the admin console: the styled Radix select (both
// an option-object API and a plain string[] value-chip wrapper), text input,
// modal scaffold, labelled fields, and the modal action footer. Self-contained
// (own copy of the styled select) so the kit needs no app import.

import * as RSelect from '@radix-ui/react-select';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useEffect,
  useRef,
} from 'react';
import { Button } from './controls';
import {
  FIELD,
  FIELD_BOX,
  FIELD_BOX_LG,
  FIELD_MONO,
  FIELD_PAD_Y,
  FIELD_TYPE,
  FIELD_TYPE_LG,
} from './field';

// md: a form full of fields. lg: a screen whose form IS the screen (sign-in,
// register).
type FieldSize = 'md' | 'lg';
const BOX: Record<FieldSize, string> = { md: FIELD_BOX, lg: FIELD_BOX_LG };
const TYPE: Record<FieldSize, string> = { md: FIELD_TYPE, lg: FIELD_TYPE_LG };

export interface SelectOption {
  value: string;
  label: ReactNode;
  text?: string;
  disabled?: boolean;
}

export interface OptionSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  block?: boolean;
}

/** A styled dropdown built on Radix Select (rich option objects). Radix forbids
 * an empty-string option value: use a non-empty sentinel and map it at the call
 * site. */
export function OptionSelect({
  value,
  onChange,
  options,
  placeholder,
  className = '',
  ariaLabel,
  disabled,
  block,
}: Readonly<OptionSelectProps>) {
  return (
    <RSelect.Root value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <RSelect.Trigger
        aria-label={ariaLabel}
        className={`${FIELD} inline-flex items-center justify-between gap-2 data-placeholder:text-dim disabled:cursor-not-allowed disabled:opacity-60 ${block ? 'w-full' : ''} ${className}`}
      >
        <span className="truncate">
          <RSelect.Value placeholder={placeholder} />
        </span>
        <RSelect.Icon className="shrink-0 text-dim">
          <IconChevronDown size={14} stroke={2.4} />
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          className="z-100 max-h-[min(60vh,20rem)] w-(--radix-select-trigger-width) min-w-40 overflow-hidden rounded-[11px] border border-border-strong bg-[#121216] shadow-pop"
        >
          <RSelect.Viewport className="p-1.5">
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                textValue={o.text ?? (typeof o.label === 'string' ? o.label : undefined)}
                className="relative flex cursor-pointer select-none items-center rounded-[7px] py-2 pl-3 pr-8 text-[13px] font-medium text-text outline-none data-disabled:cursor-not-allowed data-highlighted:bg-white/6 data-disabled:opacity-40 data-[state=checked]:text-accent"
              >
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="absolute right-2.5">
                  <IconCheck size={14} stroke={2.4} />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

/** Admin value-chip select (label === value), backed by {@link OptionSelect}.
 * Keeps the plain string[] API its call sites already use. */
export function Select({
  value,
  options,
  onChange,
}: Readonly<{
  value: string;
  options: string[];
  onChange?: (v: string) => void;
}>) {
  // Keep the current value selectable even if it isn't in the list (empty
  // values aren't valid Radix items, so they fall through to the placeholder).
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <OptionSelect
      value={value}
      onChange={(v) => onChange?.(v)}
      options={all.map((o) => ({ value: o, label: o }))}
    />
  );
}

/**
 * The console's single-line entry.
 *
 * A controlled `value` plus a plain-string `onChange`, and every other input
 * attribute (`readOnly`, `disabled`, `maxLength`, `autoComplete`, `onFocus`,
 * `ref`, `aria-*`) passes through - a field that needs one of them stays a
 * TextInput instead of becoming another hand-rolled `<input>` with its own copy
 * of the box.
 */
export function TextInput({
  value,
  onChange,
  className = '',
  type = 'text',
  size = 'md',
  mono = false,
  ...rest
}: Readonly<
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> & {
    value: string;
    onChange?: (v: string) => void;
    ref?: Ref<HTMLInputElement>;
    size?: FieldSize;
    mono?: boolean;
  }
>) {
  return (
    <input
      {...rest}
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className={`${BOX[size]} ${mono ? FIELD_MONO : TYPE[size]} ${className}`}
    />
  );
}

// Whether this browser sizes a textarea to its own content (`field-sizing`,
// Chromium only); others still need the measure below. Guarded for the
// server render, where there is no CSS object at all.
const FIELD_SIZING =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('field-sizing', 'content')
    : false;

/**
 * {@link TextInput}'s multi-line sibling: `rows` tall, growing with content
 * (shadcn's `field-sizing-content`) so text is never scrolled out of sight.
 * `rows` is the floor; `autoSize={false}` pins it there. Same pass-through
 * shape as TextInput for every other textarea attribute.
 */
export function TextArea({
  value,
  onChange,
  className = '',
  rows = 3,
  autoSize = true,
  resize,
  size = 'md',
  mono = false,
  ...rest
}: Readonly<
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'> & {
    value: string;
    onChange?: (v: string) => void;
    rows?: number;
    autoSize?: boolean;
    resize?: 'y' | 'none';
    size?: FieldSize;
    mono?: boolean;
  }
>) {
  const box = useRef<HTMLTextAreaElement>(null);

  // Browsers without `field-sizing`: reset height to `auto` FIRST so the
  // element reports the height of its content, not what we last set - the
  // difference between growing and never shrinking again. `value` is the
  // effect's trigger, not something it reads, since the measure must run
  // after the changed text has rendered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const el = box.current;
    if (!el || !autoSize || FIELD_SIZING) return;
    el.style.height = 'auto';
    if (el.scrollHeight > el.clientHeight) el.style.height = `${el.scrollHeight}px`;
  }, [value, autoSize]);

  // An auto-sizing box manages its own height, so it defaults to no grip; the
  // caller can still ask for one.
  const defaultResize = autoSize ? 'none' : 'y';
  const grip = (resize ?? defaultResize) === 'none' ? 'resize-none' : 'resize-y';
  return (
    <textarea
      {...rest}
      ref={box}
      value={value}
      rows={rows}
      onChange={(e) => onChange?.(e.target.value)}
      // A field sizing itself to its content ignores `rows`, so the floor is
      // said again as a height. The caller's own style still wins.
      style={
        autoSize ? { minHeight: `calc(${rows}lh + ${FIELD_PAD_Y})`, ...rest.style } : rest.style
      }
      className={`${BOX[size]} ${mono ? FIELD_MONO : TYPE[size]} ${grip} ${
        autoSize ? 'field-sizing-content' : ''
      } ${className}`}
    />
  );
}

/** Centered modal overlay (click-outside to close). */
export function Modal({
  title,
  children,
  onClose,
}: Readonly<{
  title: string;
  children: ReactNode;
  onClose: () => void;
}>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* Dimmed backdrop as a real control: click-to-dismiss with built-in
          keyboard support, a sibling rather than a wrapper so the dialog's
          own interactive content stays valid. */}
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      {/* An inside click lands on the dialog (relative, above the backdrop),
          so it never reaches the backdrop button - no stopPropagation needed. */}
      <div
        className="relative w-full max-w-115 rounded-2xl border border-border bg-surface-1 p-6 shadow-pop"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 font-display text-[20px] font-bold">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** A labelled form field (uppercase caption + control + optional hint below). */
export function Field({
  label,
  hint,
  children,
}: Readonly<{ label: string; hint?: string; children: ReactNode }>) {
  return (
    <div className="mb-4">
      <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[.12em] text-dim">
        {label}
      </span>
      {children}
      {hint ? <p className="mt-1.5 text-[12px] leading-relaxed text-dim">{hint}</p> : null}
    </div>
  );
}

/** The standard modal footer: a right-aligned cancel + primary pair, with an
 * optional destructive action pinned left (e.g. "Delete account"). The caller
 * passes the already-resolved `confirmLabel` (so it can swap to "Saving..."). */
export function ModalActions({
  onCancel,
  cancelLabel,
  onConfirm,
  confirmLabel,
  busy,
  disabled,
  destructive,
}: Readonly<{
  onCancel: () => void;
  cancelLabel: string;
  onConfirm: () => void;
  confirmLabel: string;
  busy?: boolean;
  disabled?: boolean;
  destructive?: { label: string; onClick: () => void; disabled?: boolean; title?: string };
}>) {
  return (
    <div
      className={`mt-5 flex items-center gap-3 ${destructive ? 'justify-between' : 'justify-end'}`}
    >
      {destructive ? (
        <button
          type="button"
          onClick={destructive.onClick}
          disabled={busy || destructive.disabled}
          title={destructive.title}
          className="text-[13px] font-semibold text-[#E8536A] disabled:opacity-40"
        >
          {destructive.label}
        </button>
      ) : null}
      <div className="flex gap-2.5">
        <Button variant="quiet" label={cancelLabel} onClick={onCancel} />
        <Button
          variant="primary"
          label={confirmLabel}
          onClick={onConfirm}
          disabled={busy || disabled}
        />
      </div>
    </div>
  );
}
