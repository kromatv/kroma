import { story } from '@kroma/workbench/story';
import { z } from 'zod';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Switch } from '#ui/components/atoms/switch';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { msg, useForm } from '#ui/lib/form';
import { useT } from '#ui/services/i18n';

const Credentials = z.object({
  email: z
    .string()
    .min(1, msg('form.required'))
    .pipe(z.email(msg('form.email'))),
  password: z.string().min(8, msg('form.tooShort', { min: 8 })),
  remember: z.boolean(),
});

function SignIn() {
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
        <Switch {...form.toggle('remember')} />
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

const Passwords = z
  .object({
    password: z.string().min(8, msg('form.tooShort', { min: 8 })),
    confirm: z.string().min(1, msg('form.required')),
  })
  .refine((entered) => entered.password === entered.confirm, msg('form.mismatch'));

function CrossField() {
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

const PairingCode = z.object({ code: z.string().min(1, msg('form.required')) });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function FailingSubmit() {
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

const Note = z.object({
  note: z
    .string()
    .min(1, 'Say something first.')
    .max(80, msg('At most {max} characters.', { max: 80 })),
});

function NoCatalog() {
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

export default story({
  name: 'Form',
  group: 'Foundations',
  docs: "Not a component: `useForm` is the kit's way of wiring a form. Give it a schema - anything speaking [Standard Schema](https://standardschema.dev), which here means zod - and it holds the values, runs the validator and hands each control the props it needs. `form.field(name)` returns one bag per element, because `<Field>` is two of them: `root` is the value and the message `<Field.Root>` owns, `input` is the return key `<Field.Input>` or `<Field.Textarea>` wires to submit. `form.toggle(name)` is a single bag, because `<Switch>` is a single element. All of them are typed off the schema: a name it does not have will not compile. Errors stay quiet until the first submit, then track every keystroke, so nothing is flagged before it was asked for and a fixed field clears as it is typed. Submit any of these empty to watch it happen, then flip the language lens in the toolbar - the messages are catalog keys, so they follow.",
  usage: `const Credentials = z.object({
  email: z.string().min(1, msg('form.required')).pipe(z.email(msg('form.email'))),
  password: z.string().min(8, msg('form.tooShort', { min: 8 })),
});

const form = useForm({
  schema: Credentials,
  defaultValues: { email: '', password: '' },
  t: useT(),
  onSubmit: (credentials) => signIn(credentials),
});
const email = form.field('email');

<Field.Root label="Email" {...email.root}>
  <Field.Input type="email" {...email.input} />
</Field.Root>

// Nothing to say to the entry? The Root renders it, and the field is one line.
<Field.Root label="Name" {...form.field('name').root} />

<Button label="Sign in" block loading={form.submitting} onPress={form.submit} />`,
  guidelines: {
    do: [
      "Write the rule once, in the schema. The message it carries is a catalog key, so `msg('form.tooShort', { min: 8 })` is translated wherever it is shown.",
      'Spread both bags: `root` on `<Field.Root>`, `input` on the entry, and the return key submits.',
      'Pass `t: useT()`. Without it a message is shown exactly as the schema wrote it, which is right for a one-off and wrong for a shipped screen.',
      'Let a check that spans two fields have no path - it lands on `form.error` instead of picking a field to blame.',
      "Throw from `onSubmit` to report a server refusal; the message goes through the same lookup, so `throw new Error('connect.invalidCode')` is translated too.",
    ],
    dont: [
      "Don't validate in the component. A hand-written `if` beside a schema is a second rule that will disagree with the first.",
      "Don't reach for a second form library. The schema is the whole configuration; there is no resolver to install.",
      "Don't hold a copy of a field in your own `useState` - `form.values` is the value, and a copy is what goes stale.",
    ],
  },
  matrix: false,
  width: { min: 320, max: 520 },
  render: () => <SignIn />,
  scenes: [
    {
      name: 'A check with no field to blame',
      docs: 'Two passwords that have to match is a rule about the OBJECT, not about either entry, so zod gives its issue no path and it lands on `form.error` rather than being pinned on the second field or dropped.',
      example: () => <CrossField />,
    },
    {
      name: 'When the submit fails',
      docs: 'While `onSubmit` runs the button spins and presses are ignored. A throw becomes `form.error`, resolved the same way a schema message is - this one throws the catalog key `connect.invalidCode`, so it reads in whichever language the toolbar is set to.',
      example: () => <FailingSubmit />,
    },
    {
      name: 'Without a catalog',
      docs: 'No `t`, and messages written as sentences: they show exactly as the schema wrote them, and `msg()` still fills in the vars. What a throwaway form or a one-language app looks like - nothing has to be added to a catalog first.',
      example: () => <NoCatalog />,
    },
  ],
});
