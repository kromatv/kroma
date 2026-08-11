import type { Translate } from '@kroma/core';
import { useCallback, useRef, useState } from 'react';
import { type MessageLookup, resolveMessage } from './message';
import { issueField, type StandardIssue, type StandardSchemaV1 } from './standard-schema';

type StringKeys<V> = { [K in keyof V]-?: V[K] extends string ? K : never }[keyof V] & string;
type BooleanKeys<V> = { [K in keyof V]-?: V[K] extends boolean ? K : never }[keyof V] & string;

type FieldErrors<V> = Partial<Record<keyof V & string, string>>;

interface TextBinding<T> {
  /** Spread onto `<Field.Root>`: the value it holds and the message it shows. */
  root: { value: T; onValueChange: (next: T) => void; error: string | undefined };
  /** Spread onto `<Field.Input>` or `<Field.Textarea>`: the return key submits. */
  input: { onSubmit: () => void };
}

interface ToggleBinding<T> {
  checked: T;
  onChange: (next: T) => void;
}

interface FormOptions<Values, Output> {
  schema: StandardSchemaV1<Values, Output>;
  defaultValues: Values;
  onSubmit?: (values: Output) => void | Promise<void>;
  /** Without one a message is shown as the schema wrote it; with one it is looked
   *  up as a catalog key first. Pass `useT()`. */
  t?: Translate;
}

interface Form<Values> {
  values: Values;
  errors: FieldErrors<Values>;
  /** A whole-form failure: a check with no field to blame, or a throw from `onSubmit`. */
  error: string | undefined;
  submitting: boolean;
  submitted: boolean;
  field: <K extends StringKeys<Values>>(name: K) => TextBinding<Values[K]>;
  toggle: <K extends BooleanKeys<Values>>(name: K) => ToggleBinding<Values[K]>;
  setValue: <K extends keyof Values & string>(name: K, next: Values[K]) => void;
  setError: (name: keyof Values & string, message?: string) => void;
  reset: (next?: Partial<Values>) => void;
  submit: () => Promise<void>;
}

interface Checked<Values, Output> {
  fields: FieldErrors<Values>;
  form: string | undefined;
  value?: Output;
}

function sortIssues<Values, Output>(
  issues: readonly StandardIssue[],
  t?: MessageLookup,
): Checked<Values, Output> {
  const fields: Record<string, string> = {};
  let form: string | undefined;
  for (const issue of issues) {
    const name = issueField(issue);
    if (name === undefined) {
      form ??= resolveMessage(issue.message, t);
      continue;
    }
    // A field shows its first failure only; anything after it is a follow-on.
    fields[name] ??= resolveMessage(issue.message, t);
  }
  return { fields: fields as FieldErrors<Values>, form };
}

function thrownMessage(cause: unknown, t?: MessageLookup): string {
  const raw = cause instanceof Error ? cause.message : cause;
  if (typeof raw !== 'string' || raw === '') return resolveMessage('form.submitFailed', t);
  return resolveMessage(raw, t);
}

/**
 * A form over any Standard Schema validator (zod, valibot, arktype): it holds the
 * values, runs the schema and hands each control the props it needs, so a screen
 * writes the schema and the layout and nothing in between.
 *
 * Errors stay quiet until the first submit, then track every keystroke. Each one
 * is resolved through `t`, so a schema that says `msg('form.tooShort', { min: 8 })`
 * is translated wherever it is shown.
 */
function useForm<Values extends Record<string, unknown>, Output>({
  schema,
  defaultValues,
  onSubmit,
  t,
}: FormOptions<Values, Output>): Form<Values> {
  const [values, setValues] = useState<Values>(defaultValues);
  const [errors, setErrors] = useState<FieldErrors<Values>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const live = useRef(false);
  const latest = useRef(0);
  // `Translate` is keyed to the app's catalog; a schema's message is any string.
  const lookup = t as MessageLookup | undefined;

  const check = useCallback(
    async (candidate: Values): Promise<Checked<Values, Output>> => {
      const result = await schema['~standard'].validate(candidate);
      if (result.issues) return sortIssues(result.issues, lookup);
      return { fields: {}, form: undefined, value: result.value };
    },
    [schema, lookup],
  );

  // Validates, shows what it found, and reports the parsed value back - unless a
  // later keystroke started its own run in the meantime, whose answer wins.
  const settle = async (
    candidate: Values,
  ): Promise<{ ok: true; value: Output } | { ok: false }> => {
    latest.current += 1;
    const ticket = latest.current;
    const { fields, form, value } = await check(candidate);
    if (ticket !== latest.current) return { ok: false };
    setErrors(fields);
    setFormError(form);
    return value === undefined ? { ok: false } : { ok: true, value };
  };

  const setValue = <K extends keyof Values & string>(name: K, next: Values[K]) => {
    // Updater form, so two writes dispatched in one batch — a browser autofill
    // filling e-mail and password together — do not lose the first.
    setValues((current) => ({ ...current, [name]: next }));
    setSubmitted(false);
    if (live.current) void settle({ ...values, [name]: next });
  };

  const submit = async () => {
    live.current = true;
    const checked = await settle(values);
    if (!checked.ok) return;

    setSubmitting(true);
    try {
      await onSubmit?.(checked.value);
      setSubmitted(true);
    } catch (cause) {
      setFormError(thrownMessage(cause, lookup));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    values,
    errors,
    error: formError,
    submitting,
    submitted,
    field: (name) => ({
      root: {
        value: values[name],
        onValueChange: (next) => setValue(name, next),
        error: errors[name],
      },
      input: { onSubmit: submit },
    }),
    toggle: (name) => ({
      checked: values[name],
      onChange: (next) => setValue(name, next),
    }),
    setValue,
    setError: (name, message) =>
      setErrors((current) => ({
        ...current,
        [name]: message === undefined ? undefined : resolveMessage(message, lookup),
      })),
    reset: (next) => {
      latest.current += 1;
      live.current = false;
      setValues(next ? { ...defaultValues, ...next } : defaultValues);
      setErrors({});
      setFormError(undefined);
      setSubmitted(false);
      setSubmitting(false);
    },
    submit,
  };
}

export type { FieldErrors, Form, FormOptions, TextBinding, ToggleBinding };
export { useForm };
