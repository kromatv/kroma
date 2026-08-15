import { z } from 'zod';

import { Box } from '#ui/components/atoms/box';

import { Button } from '#ui/components/atoms/button';

import { Switch } from '#ui/components/atoms/switch';

import { Text } from '#ui/components/atoms/text';

import { Field } from '#ui/components/molecules/field';

import { msg, useForm } from '#ui/lib/form';

import { useT } from '#ui/services/i18n';

export const Credentials = z.object({
  email: z
    .string()
    .min(1, msg('form.required'))
    .pipe(z.email(msg('form.email'))),
  password: z.string().min(8, msg('form.tooShort', { min: 8 })),
  remember: z.boolean(),
});

export function SignIn() {
  const form = useForm({
    schema: Credentials,
    defaultValues: { email: '', password: '', remember: true },
    t: useT(),
  });
  const email = form.field('email');
  const password = form.field('password');
  return (
    <Box gap={18}>
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
      </Field.Root>
      <Box row align="center" gap={14}>
        <Switch label="Keep me signed in" {...form.toggle('remember')} />
        <Text variant="meta" color="textMuted">
          Keep me signed in
        </Text>
      </Box>
      <Button label="Sign in" block loading={form.submitting} onPress={form.submit} />
      {form.submitted ? (
        <Text variant="meta" color="success">
          Signed in. Nothing was sent anywhere.
        </Text>
      ) : null}
    </Box>
  );
}

export const Passwords = z
  .object({
    password: z.string().min(8, msg('form.tooShort', { min: 8 })),
    confirm: z.string().min(1, msg('form.required')),
  })
  .refine((entered) => entered.password === entered.confirm, msg('form.mismatch'));

export function CrossField() {
  const form = useForm({
    schema: Passwords,
    defaultValues: { password: '', confirm: '' },
    t: useT(),
  });
  const password = form.field('password');
  const confirm = form.field('confirm');
  return (
    <Box gap={18}>
      <Field.Root label="New password" {...password.root}>
        <Field.Input type="password" physicalKeyboard {...password.input} />
      </Field.Root>
      <Field.Root label="Repeat it" {...confirm.root}>
        <Field.Input type="password" physicalKeyboard {...confirm.input} />
      </Field.Root>
      <Button label="Change password" block onPress={form.submit} />
      {form.error ? (
        <Text variant="meta" color="danger">
          {form.error}
        </Text>
      ) : null}
    </Box>
  );
}

export const PairingCode = z.object({ code: z.string().min(1, msg('form.required')) });

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function FailingSubmit() {
  const form = useForm({
    schema: PairingCode,
    defaultValues: { code: '' },
    t: useT(),
    onSubmit: async () => {
      await wait(900);
      throw new Error('connect.invalidCode');
    },
  });
  const code = form.field('code');
  return (
    <Box gap={18}>
      <Field.Root label="Pairing code" {...code.root}>
        <Field.Input placeholder="XY7-42Q" physicalKeyboard {...code.input} />
      </Field.Root>
      <Button label="Pair" block loading={form.submitting} onPress={form.submit} />
      {form.error ? (
        <Text variant="meta" color="danger">
          {form.error}
        </Text>
      ) : null}
    </Box>
  );
}

export const Note = z.object({
  note: z
    .string()
    .min(1, 'Say something first.')
    .max(80, msg('At most {max} characters.', { max: 80 })),
});

export function NoCatalog() {
  const form = useForm({ schema: Note, defaultValues: { note: '' } });
  const note = form.field('note');
  return (
    <Box gap={18}>
      <Field.Root label="Note" {...note.root}>
        <Field.Textarea rows={2} physicalKeyboard {...note.input} />
      </Field.Root>
      <Button label="Post" block onPress={form.submit} />
    </Box>
  );
}
