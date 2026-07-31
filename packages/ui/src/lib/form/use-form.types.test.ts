// The assertions that matter here are checked by `tsc`, not by the runner: the
// `it()` below only keeps the file honest as a test.

import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { TextBinding, ToggleBinding } from './use-form';
import { useForm } from './use-form';

const Account = z.object({
  email: z.string(),
  password: z.string(),
  remember: z.boolean(),
  // Input and output differ: the entry stays text, `onSubmit` gets a number.
  port: z.string().transform(Number),
});

type Values = z.input<typeof Account>;
type Account = ReturnType<typeof account>;

const account = () =>
  useForm({
    schema: Account,
    defaultValues: { email: '', password: '', remember: false, port: '4040' },
    onSubmit: (parsed) => {
      expectTypeOf(parsed).toEqualTypeOf<z.output<typeof Account>>();
      expectTypeOf(parsed.port).toEqualTypeOf<number>();
    },
  });

describe('the form types', () => {
  it('are inferred from the schema alone', () => {
    expectTypeOf<Account['values']>().toEqualTypeOf<Values>();
    expectTypeOf<Account['values']['port']>().toEqualTypeOf<string>();
  });

  it('let `field` name only the text keys, and `toggle` only the boolean ones', () => {
    expectTypeOf<Parameters<Account['field']>[0]>().toEqualTypeOf<'email' | 'password' | 'port'>();
    expectTypeOf<Parameters<Account['toggle']>[0]>().toEqualTypeOf<'remember'>();
  });

  it('bind exactly what the controls take', () => {
    expectTypeOf<ReturnType<Account['field']>>().toEqualTypeOf<TextBinding<string>>();
    expectTypeOf<ReturnType<Account['toggle']>>().toEqualTypeOf<ToggleBinding<boolean>>();
  });

  it('key the errors by the schema', () => {
    expectTypeOf<Account['errors']>().toEqualTypeOf<
      Partial<Record<'email' | 'password' | 'remember' | 'port', string>>
    >();
  });
});

/** Never called: every line is a compile-time assertion about what is refused. */
export function refusals(form: Account) {
  // @ts-expect-error a name the schema does not have
  form.field('nickname');
  // @ts-expect-error a boolean is not a text entry
  form.field('remember');
  // @ts-expect-error a string is not a toggle
  form.toggle('email');
  // @ts-expect-error the value has to match the field it is set on
  form.setValue('remember', 'yes');
  // @ts-expect-error errors are keyed by the schema too
  form.errors.nickname;
}

/** Never rendered; the assertion is that half a set of defaults does not compile. */
export function HalfDefaults() {
  return useForm({
    schema: Account,
    // @ts-expect-error the defaults have to cover the whole schema
    defaultValues: { email: '' },
  });
}
