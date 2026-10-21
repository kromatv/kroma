import { useT } from '@kromatv/ui';
import { Box, Field, Focusable, Text } from '@kromatv/ui/kit';
import { useState } from 'react';

// A write-only credential: starts empty every time, since the server never
// sends a stored secret back, and blur commits only a non-empty value so
// leaving the field alone can never wipe a working key by accident. Removing
// one is the Clear button's job. `masked` picks the shape the credential
// wants: one hidden line for a password, a wrapping box for a PEM key or a
// service-account JSON.
export function SecretInput({
  configured,
  masked,
  onCommit,
}: Readonly<{ configured: boolean; masked: boolean; onCommit: (v: string) => void }>) {
  const t = useT();
  const [v, setV] = useState('');
  const commit = () => {
    if (!v.trim()) return;
    onCommit(v);
    setV('');
  };
  const placeholder = configured ? t('admin.secretReplace') : undefined;
  return (
    <Box align="flex-end" gap={6}>
      <Field.Root
        label={t(configured ? 'admin.secretReplace' : 'admin.secretUnset')}
        hideLabel
        value={v}
        onValueChange={setV}
      >
        {masked ? (
          <Field.Input
            type="password"
            autoComplete="off"
            placeholder={placeholder}
            minW={280}
            onBlur={commit}
          />
        ) : (
          <Field.Textarea rows={3} placeholder={placeholder} minW={280} onBlur={commit} />
        )}
      </Field.Root>
      <Box row align="center" gap={10}>
        <Text variant="overline" color={configured ? 'success' : 'text/30'}>
          {configured ? t('admin.secretSet') : t('admin.secretUnset')}
        </Text>
        {configured ? (
          // A Focusable, not a pressable Text: react-native-web wires Text
          // onPress as click only, so Enter/Space on the tabbed control would
          // do nothing.
          <Focusable
            label={t('admin.secretClear')}
            onPress={() => {
              setV('');
              onCommit('');
            }}
          >
            <Text variant="overline" color="text/40">
              {t('admin.secretClear')}
            </Text>
          </Focusable>
        ) : null}
      </Box>
    </Box>
  );
}
