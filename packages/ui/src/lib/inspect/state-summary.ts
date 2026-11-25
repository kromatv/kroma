import { isValidElement } from 'react';
import {
  isObject,
  MAX_KEYS,
  type PropValue,
  type Reader,
  summarize,
  summarizeEntries,
  summarizeHiding,
} from './prop-summary';

/** One key of a control's state as the reader reports it: a primitive or a
 *  tag as for props, or a list or a record of such values. */
export type StateValue = PropValue | readonly StateValue[] | { readonly [key: string]: StateValue };

/** What a control holds, bounded in depth, in entries and in string length,
 *  safe to serialise. */
export type StateSummary = Readonly<Record<string, StateValue>>;

const MAX_DEPTH = 2;

const isRecord = (value: unknown): value is object =>
  isObject(value) &&
  !isValidElement(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

function listOf(value: readonly unknown[], depth: number): StateValue[] {
  const list = value.slice(0, MAX_KEYS).map((entry) => stateOf(entry, depth) ?? null);
  return value.length > MAX_KEYS ? [...list, `…+${value.length - MAX_KEYS}`] : list;
}

function stateOf(value: unknown, depth: number): StateValue | undefined {
  if (depth < MAX_DEPTH && Array.isArray(value)) {
    return listOf(value, depth + 1);
  }
  if (depth < MAX_DEPTH && isRecord(value)) {
    return summarizeEntries(value, (entry) => stateOf(entry, depth + 1));
  }
  return summarize(value);
}

const STATE: Reader<StateValue> = {
  read: (value) => stateOf(value, 0),
  hides: (value) => typeof value === 'string' || isObject(value),
};

/**
 * Reduces what a control of the component `name` holds like its props, except
 * that a list or a record reads in full two levels deep, each cut at
 * {@link MAX_KEYS} entries: a list ends with `…+N`, a record with a `…` entry.
 * What was typed into a field that hides it reads `[secret]`, list or not.
 */
export function summarizeState(name: string, props: unknown, values: unknown): StateSummary {
  return summarizeHiding({ name, props, values }, STATE);
}
