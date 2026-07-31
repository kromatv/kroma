import { z } from 'zod';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';
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
 * validator and hands each `<Field>` its props, so nothing between the schema and
 * the layout is written by hand. Submit it empty to watch the errors take the
 * hints' place and tint both entries at once - the rule the molecule exists to
 * enforce - then fix one and watch it clear as you type. The messages are catalog
 * keys, so the language lens in the toolbar moves them too.
 *
 * @name Sign-in form
 */
export default function SignIn() {
  const form = useForm({
    schema: Credentials,
    defaultValues: { email: '', password: '' },
    t: useT(),
  });

  return (
    <Box w={380} gap={18}>
      <Field
        label="Email"
        type="email"
        icon="message"
        placeholder="you@example.org"
        physicalKeyboard
        {...form.field('email')}
      />
      <Field
        label="Password"
        type="password"
        hint="Eight characters or more."
        physicalKeyboard
        {...form.field('password')}
      />
      <Button label="Sign in" block loading={form.submitting} onPress={form.submit} />
      {form.submitted ? (
        <Txt variant="meta" color="success">
          Signed in. Nothing was sent anywhere.
        </Txt>
      ) : null}
    </Box>
  );
}
