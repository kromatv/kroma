import { isValidElement } from 'react';

/** One prop as the reader reports it: a primitive, or a short tag for anything else. */
export type PropValue = string | number | boolean | null;

/** A component's props, bounded in keys and in string length, safe to serialise. */
export type PropSummary = Readonly<Record<string, PropValue>>;

/** The most entries a summary keeps. */
export const MAX_KEYS = 24;
const MAX_KEY = 40;
const MAX_TEXT = 120;
const SECRET = '[secret]';
const SECRET_NAME = /Pin|Otp|Password|Secret/;
const SECRET_FILL = /password|one-time-code/;
const TYPED: ReadonlySet<string> = new Set(['value', 'defaultValue']);
const NOTHING: ReadonlySet<string> = new Set();

const splitsPair = (value: string, at: number) => (value.codePointAt(at - 1) ?? 0) > 0xffff;

function cut(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, splitsPair(value, max) ? max - 1 : max)}…`;
}

function tagOf(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return `[${typeof value}]`;
  }
  if (Array.isArray(value)) {
    return `[array ${value.length}]`;
  }
  return isValidElement(value) ? '[element]' : '[object]';
}

/** A value as a primitive, or a short tag for anything else. */
export function summarize(value: unknown): PropValue | undefined {
  switch (typeof value) {
    case 'undefined':
      return undefined;
    case 'string':
      return cut(value, MAX_TEXT);
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
      return value;
    default:
      return value === null ? null : tagOf(value);
  }
}

/** Whether a value is an object a reader may look into. */
export const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;

const isText = (value: unknown): boolean => typeof value === 'string';

function holdsSecret(name: string, props: object): boolean {
  return (
    SECRET_NAME.test(name) ||
    Reflect.get(props, 'type') === 'password' ||
    Reflect.get(props, 'secureTextEntry') === true ||
    Reflect.get(props, 'mask') === true ||
    SECRET_FILL.test(String(Reflect.get(props, 'autoComplete')))
  );
}

const both = (props: object, values: object): object =>
  values === props ? props : { ...props, ...values };

type Hides = (value: unknown) => boolean;

function typedSecrets(name: string, props: object, hides: Hides): ReadonlySet<string> {
  if (!holdsSecret(name, props)) {
    return NOTHING;
  }
  return new Set([...TYPED].filter((key) => hides(Reflect.get(props, key))));
}

/** The entries of `values`, at most {@link MAX_KEYS} of them plus a `…` entry
 *  counting the rest, each name cut and each value as `read` reduces it. */
export function summarizeEntries<T>(
  values: object,
  read: (value: unknown, key: string) => T | undefined,
): Record<string, T | string> {
  const summary: Record<string, T | string> = {};
  const keys = Object.keys(values);
  for (const key of keys.slice(0, MAX_KEYS)) {
    const value = read(Reflect.get(values, key), key);
    if (value !== undefined) {
      summary[cut(key, MAX_KEY)] = value;
    }
  }
  if (keys.length > MAX_KEYS) {
    summary['…'] = `+${keys.length - MAX_KEYS}`;
  }
  return summary;
}

type Summarized = { name: string; props: unknown; values: unknown };

/** How a summary reduces a value, and which typed values it hides. */
export type Reader<T> = { read: (value: unknown) => T | undefined; hides: Hides };

/** The entries of `values`, with what was typed into a field that hides it
 *  reported as `[secret]`. */
export function summarizeHiding<T>(
  { name, props, values }: Summarized,
  { read, hides }: Reader<T>,
): Readonly<Record<string, T | string>> {
  if (!isObject(props) || !isObject(values)) {
    return {};
  }
  const hidden = typedSecrets(name, both(props, values), hides);
  return summarizeEntries(values, (value, key) => (hidden.has(key) ? SECRET : read(value)));
}

const PROPS: Reader<PropValue> = { read: summarize, hides: isText };

/**
 * Reduces the props of the component `name` to at most a few dozen JSON-safe
 * entries, with long names and long strings cut. What was typed into a field that hides it (a password, a PIN, a
 * one-time code) is never reported, only that there is a value. Given `values`,
 * it reduces those instead and reads `props` only to know what to hide.
 */
export function summarizeProps(name: string, props: unknown, values: unknown = props): PropSummary {
  return summarizeHiding({ name, props, values }, PROPS);
}
