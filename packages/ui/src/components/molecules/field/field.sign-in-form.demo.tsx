import { z } from 'zod';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { msg, useForm } from '#ui/lib/form';
import { useT } from '#ui/services/i18n';
import { Field } from './field';

const Credentials = z.object({
  email: z
    .string()
    .min(1, msg('form.required'))
    .pipe(z.email(msg('form.email'))),
  password: z.string().min(8, msg('form.tooShort', { min: 8 })),
});

/**
 * The same two fields, driven by a schema. `useForm` holds the values, runs the
 * validator and hands each binding to the parts: the value and the message to
 * `<Field.Root>`, the return key to `<Field.Input>`. Submit it empty to watch the
 * errors take the hints' place and tint both entries at once - the rule the
 * molecule exists to enforce - then fix one and watch it clear as you type. The
 * messages are catalog keys, so the language lens in the toolbar moves them too.
 *
 * @name Sign-in form
 */
export default function SignIn() {
  const form = useForm({
    schema: Credentials,
    defaultValues: { email: '', password: '' },
    t: useT(),
  });
  const email = form.field('email');
  const password = form.field('password');

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
      </Field.Root>
      <Field.Root label="Password" {...password.root}>
        <Field.Input type="password" physicalKeyboard {...password.input} />
        <Field.Hint>Eight characters or more.</Field.Hint>
      </Field.Root>
      <Button label="Sign in" block loading={form.submitting} onPress={form.submit} />
      {form.submitted ? (
        <Text variant="meta" color="success">
          Signed in. Nothing was sent anywhere.
        </Text>
      ) : null}
    </Box>
  );
}
