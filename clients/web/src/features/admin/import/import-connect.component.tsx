import type { Importer } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { Row, Spinner, Text } from '@kromatv/ui/kit';
import { ImportFrame } from '#web/features/admin/import/import-frame.component';
import { ImportSignInElsewhere } from '#web/features/admin/import/import-sign-in-elsewhere.component';
import { ImportSignInForm } from '#web/features/admin/import/import-sign-in-form.component';

interface ConnectProps {
  importer: Importer;
  onBack: () => void;
}

function Starting({ onBack }: Readonly<Pick<ConnectProps, 'onBack'>>) {
  const t = useT();
  return (
    <>
      <ImportFrame.Panel>
        <Row align="center" gap={12}>
          <Spinner size={22} />
          <Text color="textMuted">{t('setup.importStarting')}</Text>
        </Row>
      </ImportFrame.Panel>
      <ImportFrame.Footer>
        <ImportFrame.Previous onPress={onBack} />
      </ImportFrame.Footer>
    </>
  );
}

function SignIn({ importer, onBack }: Readonly<ConnectProps>) {
  if (!importer.running) {
    return <Starting onBack={onBack} />;
  }
  return importer.fields.length > 0 ? (
    <ImportSignInForm importer={importer} onBack={onBack} />
  ) : (
    <ImportSignInElsewhere importer={importer} onBack={onBack} />
  );
}

/** The sign-in to the other server: the form its importer asks for, or the
 * way to the page that server wants the owner on. An importer that has just
 * installed is waited on until it runs. */
export function ImportConnect({ importer, onBack }: Readonly<ConnectProps>) {
  const t = useT();
  const name = importer.label ?? importer.name;
  const sub =
    importer.fields.length > 0
      ? t('setup.importConnectSub')
      : t('setup.importConnectElsewhere', { name });
  return (
    <>
      <ImportFrame.Header>
        <ImportFrame.Title>{t('setup.importConnectTitle', { name })}</ImportFrame.Title>
        <ImportFrame.Subtitle>{sub}</ImportFrame.Subtitle>
      </ImportFrame.Header>
      <SignIn importer={importer} onBack={onBack} />
    </>
  );
}
