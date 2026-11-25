import { isValidElement } from 'react';

/** One prop as the reader reports it: a primitive, or a short tag for anything else. */
export type PropValue = string | number | boolean | null;

/** A component's props, bounded in keys and in string length, safe to serialise. */
export type PropSummary = Readonly<Record<string, PropValue>>;

const MAX_KEYS = 24;
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

function summarize(value: unknown): PropValue | undefined {
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

function holdsSecret(name: string, props: object): boolean {
  return (
    SECRET_NAME.test(name) ||
    Reflect.get(props, 'type') === 'password' ||
    Reflect.get(props, 'secureTextEntry') === true ||
    Reflect.get(props, 'mask') === true ||
    SECRET_FILL.test(String(Reflect.get(props, 'autoComplete')))
  );
}

function typedSecrets(name: string, props: object): ReadonlySet<string> {
  if (!holdsSecret(name, props)) {
    return NOTHING;
  }
  return new Set([...TYPED].filter((key) => typeof Reflect.get(props, key) === 'string'));
}

/**
 * Reduces the props of the component `name` to at most a few dozen JSON-safe
 * entries, with long names and long strings cut. What was typed into a field that hides it (a password, a PIN, a
 * one-time code) is never reported, only that there is a value.
 */
export function summarizeProps(name: string, props: unknown): PropSummary {
  const summary: Record<string, PropValue> = {};
  if (typeof props !== 'object' || props === null) {
    return summary;
  }
  const hidden = typedSecrets(name, props);
  const keys = Object.keys(props);
  for (const key of keys.slice(0, MAX_KEYS)) {
    const value = hidden.has(key) ? SECRET : summarize(Reflect.get(props, key));
    if (value !== undefined) {
      summary[cut(key, MAX_KEY)] = value;
    }
  }
  if (keys.length > MAX_KEYS) {
    summary['…'] = `+${keys.length - MAX_KEYS}`;
  }
  return summary;
}
