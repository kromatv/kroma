import type { Importer } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { GuidedFlow, Row, Spinner, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { ImportSignInElsewhere } from '#web/features/setup/import-sign-in-elsewhere.component';
import { ImportSignInForm } from '#web/features/setup/import-sign-in-form.component';
import { StepFailure } from '#web/features/setup/step-failure.component';
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

function Starting({ importer, onBack }: Readonly<ConnectProps>) {
  const t = useT();
  const install = useInstalled(importer);
  return (
    <>
      <GuidedFlow.Panel>
        {install.error ? (
          <StepFailure error={t('setup.importInstallFailed')} />
        ) : (
          <Row align="center" gap={12}>
            <Spinner size={22} />
            <Text color="textMuted">{t('setup.importInstalling')}</Text>
          </Row>
        )}
      </GuidedFlow.Panel>
      <GuidedFlow.Footer>
        <GuidedFlow.Previous onPress={onBack} />
      </GuidedFlow.Footer>
    </>
  );
}

function SignIn({ importer, onBack }: Readonly<ConnectProps>) {
  if (!importer.running) {
    return <Starting importer={importer} onBack={onBack} />;
  }
  return importer.fields.length > 0 ? (
    <ImportSignInForm importer={importer} onBack={onBack} />
  ) : (
    <ImportSignInElsewhere importer={importer} onBack={onBack} />
  );
}

/** The sign-in to the other server: the form its importer asks for, or the
 * way to the page that server wants the owner on. An importer the server does
 * not hold yet installs first. */
export function ImportConnect({ importer, onBack }: Readonly<ConnectProps>) {
  const t = useT();
  const name = importer.label ?? importer.name;
  const sub =
    importer.fields.length > 0
      ? t('setup.importConnectSub')
      : t('setup.importConnectElsewhere', { name });
  return (
    <>
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.importConnectTitle', { name })}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{sub}</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <SignIn importer={importer} onBack={onBack} />
    </>
  );
}
