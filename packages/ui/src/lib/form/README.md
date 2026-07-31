# Forms

`useForm` is the kit's form: it holds the values, runs a schema over them and
hands each control the props it needs.

```tsx
const Credentials = z.object({
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
<Button label="Sign in" block loading={form.submitting} onPress={form.submit} />
```

`form.field(name)` returns exactly what `<Field>` takes — value, `onChange`,
`error`, and an `onSubmit` so the return key submits. `form.toggle(name)` does
the same for `<Switch>`. Both are typed off the schema: only string keys reach
`field`, only boolean keys reach `toggle`, and a name that is not in the schema
does not compile.

## Any validator, no dependency

The `schema` is anything implementing [Standard
Schema](https://standardschema.dev) — zod, valibot, arktype. The spec is types
only, so `standard-schema.ts` vendors the interface and `@kroma/ui` depends on
no validator at all. Apps bring their own; this repo uses zod.

## Messages are catalog keys

A validator can only carry a string as its error, so a key travels as that
string and `msg()` packs any interpolation vars into a query tail
(`form.tooShort?min=8`). `useForm` unpacks it and resolves it through `t`:

- a key the catalog knows becomes the translated sentence, vars filled in;
- anything else is shown as written, so `z.string().min(8, 'Eight or more.')`
  still works and needs no catalog entry;
- `count` is decoded as a number, so plural selection works.

A tail only counts when it is entirely `name=value` pairs, which leaves an
ordinary sentence ending in a question mark alone.

The shared keys (`form.required`, `form.email`, `form.tooShort`, …) live in
`@kroma/core`'s catalogs next to every other string.

## When errors appear

Quiet until the first submit, then live on every keystroke — so nothing is
flagged before it has been asked for, and a fixed field clears as it is typed.
`reset()` returns the form to quiet.

An issue with no path — zod's `.refine()` on the object, a password confirmation
— has no field to blame, so it lands on `form.error` rather than being dropped.
A throw from `onSubmit` lands there too, and its message goes through the same
resolution, so `throw new Error('auth.invalidCredentials')` is translated.
