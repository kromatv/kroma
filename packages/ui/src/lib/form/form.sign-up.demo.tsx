import { z } from 'zod';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Switch } from '#ui/components/atoms/switch';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { msg, useForm } from '#ui/lib/form';
import { useT } from '#ui/services/i18n';

const SignUp = z
  .object({
    email: z
      .string()
      .min(1, msg('form.required'))
      .pipe(z.email(msg('form.email'))),
    password: z.string().min(8, msg('form.tooShort', { min: 8 })),
    confirm: z.string().min(1, msg('form.required')),
    terms: z.boolean().refine((accepted) => accepted, msg('form.required')),
  })
  .refine((entered) => entered.password === entered.confirm, msg('form.mismatch'));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A whole screen's worth of form: field rules, a check across two of them, a
 * toggle that has to be on, and a server that says no. Every message is a catalog
 * key except the last one, which is a plain sentence - both work, so a rule does
 * not have to earn a catalog entry before it can exist.
 *
 * @name Sign-up
 */
export default function SignUpForm() {
  const form = useForm({
    schema: SignUp,
    defaultValues: { email: '', password: '', confirm: '', terms: false },
    t: useT(),
    onSubmit: async ({ email }) => {
      await wait(900);
      if (email === 'ada@example.org') throw new Error('That email is already registered.');
    },
  });
  const email = form.field('email');
  const password = form.field('password');
  const confirm = form.field('confirm');

  return (
    <Box w={380} gap={18}>
      <Field.Root label="Email" {...email.root}>
        <Field.Input
          type="email"
          icon="message"
          placeholder="you@example.org"
          physicalKeyboard
          {...email.input}
        />
        <Field.Hint>Try ada@example.org to be refused.</Field.Hint>
      </Field.Root>
      <Field.Root label="Password" {...password.root}>
        <Field.Input type="password" physicalKeyboard {...password.input} />
      </Field.Root>
      <Field.Root label="Repeat it" {...confirm.root}>
        <Field.Input type="password" physicalKeyboard {...confirm.input} />
      </Field.Root>

      <Box row align="center" gap={14}>
        <Switch {...form.toggle('terms')} />
        <Text variant="meta" color={form.errors.terms ? 'danger' : 'textMuted'}>
          I have read the terms
        </Text>
      </Box>

      <Button label="Create account" block loading={form.submitting} onPress={form.submit} />

      {form.error ? (
        <Text variant="meta" color="danger">
          {form.error}
        </Text>
      ) : null}
      {form.submitted ? (
        <Text variant="meta" color="success">
          Account created. Nothing was sent anywhere.
        </Text>
      ) : null}
    </Box>
  );
}
