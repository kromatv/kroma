import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';
import { Field } from './field';

interface Errors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): Errors {
  const errors: Errors = {};
  if (!email) errors.email = 'An email address is required.';
  else if (!email.includes('@')) errors.email = 'That does not look like an email address.';
  if (password.length < 8) errors.password = 'Use at least eight characters.';
  return errors;
}

/**
 * Two fields and a submit, with validation on press. Submit it empty to watch
 * the errors take the hints' place and tint both entries at once - the rule the
 * molecule exists to enforce.
 *
 * @name Sign-in form
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [signedIn, setSignedIn] = useState(false);

  const submit = () => {
    const found = validate(email, password);
    setErrors(found);
    setSignedIn(Object.keys(found).length === 0);
  };

  return (
    <Box w={380} gap={18}>
      <Field
        label="Email"
        type="email"
        icon="message"
        placeholder="you@example.org"
        value={email}
        onChange={setEmail}
        error={errors.email}
        physicalKeyboard
      />
      <Field
        label="Password"
        type="password"
        hint="Eight characters or more."
        value={password}
        onChange={setPassword}
        error={errors.password}
        physicalKeyboard
      />
      <Button label="Sign in" block onPress={submit} />
      {signedIn ? (
        <Txt variant="meta" color="success">
          Signed in. Nothing was sent anywhere.
        </Txt>
      ) : null}
    </Box>
  );
}
