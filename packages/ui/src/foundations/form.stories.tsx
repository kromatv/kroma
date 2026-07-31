import { story } from '@kroma/workbench/story';
import { z } from 'zod';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Switch } from '#ui/components/atoms/switch';
import { Txt } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { Select } from '#ui/components/molecules/select';
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
  return (
    <Box gap={18}>
      <Field
        label="Email"
        type="email"
        icon="message"
        placeholder="you@example.org"
        physicalKeyboard
        {...form.field('email')}
      />
      <Field label="Password" type="password" physicalKeyboard {...form.field('password')} />
      <Box row align="center" gap={14}>
        <Switch {...form.toggle('remember')} />
        <Txt variant="meta" color="textMuted">
          Keep me signed in
        </Txt>
      </Box>
      <Button label="Sign in" block loading={form.submitting} onPress={form.submit} />
      {form.submitted ? (
        <Txt variant="meta" color="success">
          Signed in. Nothing was sent anywhere.
        </Txt>
      ) : null}
    </Box>
  );
}

const QUALITY = [
  { value: 'original', label: 'Original' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
];

const Server = z.object({
  address: z.string().min(1, msg('form.required')),
  quality: z.string().min(1, msg('form.required')),
  transcode: z.boolean(),
  notes: z.string().max(120, msg('form.tooLong', { max: 120 })),
});

function EveryControl() {
  const form = useForm({
    schema: Server,
    defaultValues: { address: '', quality: '', transcode: false, notes: '' },
    t: useT(),
  });
  return (
    <Box gap={18}>
      <Field
        label="Server address"
        icon="server"
        placeholder="kroma.local:4040"
        physicalKeyboard
        {...form.field('address')}
      />
      <Field label="Quality" error={form.errors.quality}>
        <Select
          label="Quality"
          options={QUALITY}
          value={form.values.quality}
          onChange={(next) => form.setValue('quality', next)}
          invalid={Boolean(form.errors.quality)}
        />
      </Field>
      <Box row align="center" gap={14}>
        <Switch {...form.toggle('transcode')} />
        <Txt variant="meta" color="textMuted">
          Transcode on the fly
        </Txt>
      </Box>
      <Field label="Notes" multiline rows={2} physicalKeyboard {...form.field('notes')} />
      <Button label="Save" block loading={form.submitting} onPress={form.submit} />
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
  return (
    <Box gap={18}>
      <Field label="New password" type="password" physicalKeyboard {...form.field('password')} />
      <Field label="Repeat it" type="password" physicalKeyboard {...form.field('confirm')} />
      <Button label="Change password" block onPress={form.submit} />
      {form.error ? (
        <Txt variant="meta" color="danger">
          {form.error}
        </Txt>
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
  return (
    <Box gap={18}>
      <Field label="Pairing code" placeholder="XY7-42Q" physicalKeyboard {...form.field('code')} />
      <Button label="Pair" block loading={form.submitting} onPress={form.submit} />
      {form.error ? (
        <Txt variant="meta" color="danger">
          {form.error}
        </Txt>
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
  return (
    <Box gap={18}>
      <Field label="Note" multiline rows={2} physicalKeyboard {...form.field('note')} />
      <Button label="Post" block onPress={form.submit} />
    </Box>
  );
}

export default story({
  name: 'Form',
  group: 'Foundations',
  docs: "Not a component: `useForm` is the kit's way of wiring a form. Give it a schema - anything speaking [Standard Schema](https://standardschema.dev), which here means zod - and it holds the values, runs the validator and hands each control the props it needs. `form.field(name)` returns exactly what `<Field>` takes, `form.toggle(name)` what `<Switch>` takes, and both are typed off the schema: a name it does not have will not compile. Errors stay quiet until the first submit, then track every keystroke, so nothing is flagged before it was asked for and a fixed field clears as it is typed. Submit any of these empty to watch it happen, then flip the language lens in the toolbar - the messages are catalog keys, so they follow.",
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

<Field label="Email" type="email" {...form.field('email')} />
<Field label="Password" type="password" {...form.field('password')} />
<Button label="Sign in" block loading={form.submitting} onPress={form.submit} />`,
  guidelines: {
    do: [
      "Write the rule once, in the schema. The message it carries is a catalog key, so `msg('form.tooShort', { min: 8 })` is translated wherever it is shown.",
      'Spread the binding: `{...form.field(name)}` also wires the return key to submit.',
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
      name: 'Every control',
      docs: 'One schema over four kinds of input. `field()` spreads onto a text entry and a multiline one; `toggle()` onto a `<Switch>`. Anything else - a `<Select>` here - reads `form.values` and reports through `form.setValue`, and still wears the label and error by sitting inside a `<Field>`.',
      render: () => <EveryControl />,
    },
    {
      name: 'A check with no field to blame',
      docs: 'Two passwords that have to match is a rule about the OBJECT, not about either entry, so zod gives its issue no path and it lands on `form.error` rather than being pinned on the second field or dropped.',
      render: () => <CrossField />,
    },
    {
      name: 'When the submit fails',
      docs: 'While `onSubmit` runs the button spins and presses are ignored. A throw becomes `form.error`, resolved the same way a schema message is - this one throws the catalog key `connect.invalidCode`, so it reads in whichever language the toolbar is set to.',
      render: () => <FailingSubmit />,
    },
    {
      name: 'Without a catalog',
      docs: 'No `t`, and messages written as sentences: they show exactly as the schema wrote them, and `msg()` still fills in the vars. What a throwaway form or a one-language app looks like - nothing has to be added to a catalog first.',
      render: () => <NoCatalog />,
    },
  ],
});
