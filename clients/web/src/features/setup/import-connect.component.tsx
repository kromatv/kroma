import type { Importer, ImportSignIn } from '@kromatv/client/importers';
import { FieldForm } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, Row, Spinner, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { REFUSAL_LINE } from '#web/features/setup/import-words';
import { ImporterIcon } from '#web/features/setup/importer-icon.component';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { StepFailure } from '#web/features/setup/step-failure.component';
import { useImportSignIn } from '#web/features/setup/use-import-sign-in.hook';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

interface ConnectProps {
  importer: Importer;
  onBack: () => void;
}

function useInstalled(importer: Importer) {
  const { moduleApi } = useWebRuntime();
  return useQuery({
    queryKey: ['setup', 'importer-install', importer.id],
    queryFn: async () => {
      await moduleApi.installById(importer.id);
      return true;
    },
    enabled: !importer.installed,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

function Starting({ importer }: Readonly<{ importer: Importer }>) {
  const t = useT();
  const install = useInstalled(importer);
  if (install.error) {
    return <StepFailure error={t('setup.importInstallFailed')} />;
  }
  return (
    <Row align="center" gap={12}>
      <Spinner size={22} />
      <Text color="textMuted">{t('setup.importInstalling')}</Text>
    </Row>
  );
}

function Refused({ answer }: Readonly<{ answer: ImportSignIn | null }>) {
  const t = useT();
  if (answer?.status !== 'refused') {
    return null;
  }
  return (
    <Callout.Root tone="danger" icon="alert-triangle">
      <Callout.Title>{t(REFUSAL_LINE[answer.reason])}</Callout.Title>
      {answer.message ? <Callout.Detail>{answer.message}</Callout.Detail> : null}
    </Callout.Root>
  );
}

function Waiting({ url }: Readonly<{ url: string }>) {
  const t = useT();
  const host = new URL(url).host;
  return (
    <Callout.Root tone="accent" icon="external-link">
      <Callout.Title>{t('setup.importPendingTitle', { host })}</Callout.Title>
      <Callout.Detail>{t('setup.importPendingDetail')}</Callout.Detail>
      <Callout.Actions>
        <Button
          size="sm"
          label={t('setup.importPendingOpen', { host })}
          onPress={() => window.open(url, '_blank', 'noopener')}
        />
      </Callout.Actions>
    </Callout.Root>
  );
}

function Who({ importer }: Readonly<{ importer: Importer }>) {
  return (
    <Row align="center" gap={12}>
      <ImporterIcon importer={importer} />
      <Text variant="label">{importer.label ?? importer.name}</Text>
    </Row>
  );
}

function Answer({ answer }: Readonly<{ answer: ImportSignIn | null }>) {
  return (
    <>
      {answer?.status === 'pending' ? <Waiting url={answer.url} /> : null}
      <Refused answer={answer} />
    </>
  );
}

function SignInForm({ importer, onBack }: Readonly<ConnectProps>) {
  const t = useT();
  const [values, setValues] = useState<Record<string, string>>({});
  const { answer, busy, connect } = useImportSignIn(importer);
  const missing = importer.fields.some((field) => field.required && !values[field.key]);
  const type = (key: string, value: string) => setValues((before) => ({ ...before, [key]: value }));
  return (
    <>
      <StepBody>
        <Who importer={importer} />
        <Box gap={16}>
          <FieldForm fields={importer.fields} values={values} onChange={type} />
        </Box>
        <Answer answer={answer} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={t('setup.importSignIn')}
          loading={busy}
          disabled={missing || answer?.status === 'pending'}
          onPress={() => void connect(values)}
        />
      </StepActions>
    </>
  );
}

/** The sign-in to the other server, with the form its importer asks for. An
 * importer the server does not hold yet installs first. */
export function ImportConnect({ importer, onBack }: Readonly<ConnectProps>) {
  const t = useT();
  const name = importer.label ?? importer.name;
  return (
    <>
      <StepHeading
        title={t('setup.importConnectTitle', { name })}
        sub={t('setup.importConnectSub')}
      />
      {importer.running ? (
        <SignInForm importer={importer} onBack={onBack} />
      ) : (
        <>
          <StepBody>
            <Starting importer={importer} />
          </StepBody>
          <StepActions onBack={onBack}>{null}</StepActions>
        </>
      )}
    </>
  );
}
