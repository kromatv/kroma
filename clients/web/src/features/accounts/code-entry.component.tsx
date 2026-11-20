import { useT } from '@kromatv/ui';
import { Box, Button, classes, Icon, OtpField, styles, Text, useStyles } from '@kromatv/ui/kit';
import { type CodeEntryState, useCodeEntry } from './use-code-entry.hook';

const CODE_LENGTH = 4;

export function CodeEntry({ initial }: Readonly<{ initial: string }>) {
  const entry = useCodeEntry(initial);
  return entry.status === 'ok' ? <Connected /> : <CodeForm entry={entry} />;
}

function CodeForm({ entry }: Readonly<{ entry: CodeEntryState }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const { code, status, busy, submit } = entry;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={classes(s.form)}
    >
      <CodeField entry={entry} />
      <InvalidCode shown={status === 'err'} />
      <Button
        block
        label={t(busy ? 'auth.loggingIn' : 'connect.authorize')}
        onPress={() => void submit()}
        loading={busy}
        disabled={code.trim().length < CODE_LENGTH}
      />
    </form>
  );
}

function CodeField({ entry }: Readonly<{ entry: CodeEntryState }>) {
  const t = useT();
  const { code, status, busy, edit, submit } = entry;
  return (
    <OtpField.Root
      maxLength={CODE_LENGTH}
      value={code}
      onValueChange={edit}
      onComplete={(v) => void submit(v)}
      physicalKeyboard
      autoFocus
      disabled={busy}
      invalid={status === 'err'}
      label={t('connect.title')}
    />
  );
}

function InvalidCode({ shown }: Readonly<{ shown: boolean }>) {
  const t = useT();
  if (!shown) {
    return null;
  }
  return (
    <Text variant="meta" color="danger" textAlign="center">
      {t('connect.invalidCode')}
    </Text>
  );
}

function Connected() {
  const t = useT();
  return (
    <Box radius="xl" border="success/40" bg="success/10" px={16} py={24}>
      <Box center mb={4}>
        <Icon name="check" size={38} thickness={2.4} color="success" />
      </Box>
      <Text variant="title" textAlign="center">
        {t('connect.connected')}
      </Text>
      <Text variant="meta" color="textMuted" textAlign="center" mt={4}>
        {t('connect.willConnectSoon')}
      </Text>
    </Box>
  );
}

const sDefinition = styles({
  form: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 },
});
