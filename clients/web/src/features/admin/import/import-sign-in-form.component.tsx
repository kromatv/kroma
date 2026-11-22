import type { Importer, ImportSignIn } from '@kromatv/client/importers';
import { FieldForm } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, GuidedFlow } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  ADDRESS_FIELD,
  ImportFoundServers,
} from '#web/features/admin/import/import-found-servers.component';
import { ImportRefused } from '#web/features/admin/import/import-refused.component';
import { ImporterIcon } from '#web/features/admin/import/importer-icon.component';
import { openPage, useImportSignIn } from '#web/features/admin/import/use-import-sign-in.hook';

interface FormProps {
  importer: Importer;
  onBack: () => void;
}

function Waiting({ answer }: Readonly<{ answer: ImportSignIn | null }>) {
  const t = useT();
  if (answer?.status !== 'pending') {
    return null;
  }
  const { url } = answer;
  const host = new URL(url).host;
  return (
    <Callout.Root tone="accent" icon="external-link">
      <Callout.Title>{t('setup.importPendingTitle', { host })}</Callout.Title>
      <Callout.Detail>{t('setup.importPendingDetail')}</Callout.Detail>
      <Callout.Actions>
        <Button
          size="sm"
          label={t('setup.importPendingOpen', { host })}
          onPress={() => openPage(url)}
        />
      </Callout.Actions>
    </Callout.Root>
  );
}

interface FooterProps {
  onBack: () => void;
  busy: boolean;
  missing: boolean;
  onSend: () => void;
}

function SignInFooter({ onBack, busy, missing, onSend }: Readonly<FooterProps>) {
  const t = useT();
  return (
    <GuidedFlow.Footer>
      <GuidedFlow.Previous onPress={onBack} />
      <GuidedFlow.Actions>
        <GuidedFlow.Next
          label={t('setup.importSignIn')}
          loading={busy}
          disabled={missing}
          onPress={onSend}
        />
      </GuidedFlow.Actions>
    </GuidedFlow.Footer>
  );
}

/** The sign-in to a server through the form its importer declares. */
export function ImportSignInForm({ importer, onBack }: Readonly<FormProps>) {
  const [values, setValues] = useState<Record<string, string>>({});
  const { answer, busy, connect } = useImportSignIn(importer);
  const missing = importer.fields.some((field) => field.required && !values[field.key]);
  const type = (key: string, value: string) => setValues((before) => ({ ...before, [key]: value }));
  return (
    <>
      <GuidedFlow.Panel>
        <ImporterIcon importer={importer} size={64} />
        <ImportFoundServers
          importer={importer}
          address={values[ADDRESS_FIELD]}
          onPick={(address) => type(ADDRESS_FIELD, address)}
        />
        <Box gap={16}>
          <FieldForm fields={importer.fields} values={values} onChange={type} />
        </Box>
        <Waiting answer={answer} />
        <ImportRefused answer={answer} />
      </GuidedFlow.Panel>
      <SignInFooter
        onBack={onBack}
        busy={busy}
        missing={missing}
        onSend={() => void connect(values)}
      />
    </>
  );
}
