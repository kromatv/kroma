import type { Importer, ImportSignIn } from '@kromatv/client/importers';
import { FieldForm } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  ADDRESS_FIELD,
  ImportFoundServers,
} from '#web/features/admin/import/import-found-servers.component';
import { ImportFrame } from '#web/features/admin/import/import-frame.component';
import { ImportRefused } from '#web/features/admin/import/import-refused.component';
import { ImporterIcon } from '#web/features/admin/import/importer-icon.component';
import { openPage, useImportSignIn } from '#web/features/admin/import/use-import-sign-in.hook';

const FORM_MAX = 520;

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

interface PanelProps {
  importer: Importer;
  values: Record<string, string>;
  answer: ImportSignIn | null;
  onType: (key: string, value: string) => void;
}

function FormPanel({ importer, values, answer, onType }: Readonly<PanelProps>) {
  return (
    <ImportFrame.Panel>
      <ImporterIcon importer={importer} size={64} />
      <Box gap={20} maxW={FORM_MAX}>
        <ImportFoundServers
          importer={importer}
          address={values[ADDRESS_FIELD]}
          onPick={(address) => onType(ADDRESS_FIELD, address)}
        />
        <Box gap={16}>
          <FieldForm fields={importer.fields} values={values} onChange={onType} />
        </Box>
        <Waiting answer={answer} />
        <ImportRefused answer={answer} />
      </Box>
    </ImportFrame.Panel>
  );
}

/** The sign-in to a server through the form its importer declares. */
export function ImportSignInForm({ importer, onBack }: Readonly<FormProps>) {
  const t = useT();
  const [values, setValues] = useState<Record<string, string>>({});
  const { answer, busy, connect } = useImportSignIn(importer);
  const missing = importer.fields.some((field) => field.required && !values[field.key]);
  const type = (key: string, value: string) => setValues((before) => ({ ...before, [key]: value }));
  return (
    <>
      <FormPanel importer={importer} values={values} answer={answer} onType={type} />
      <ImportFrame.Footer>
        <ImportFrame.Previous onPress={onBack} />
        <ImportFrame.Actions>
          <ImportFrame.Next
            label={t('setup.importSignIn')}
            loading={busy}
            disabled={missing}
            onPress={() => void connect(values)}
          />
        </ImportFrame.Actions>
      </ImportFrame.Footer>
    </>
  );
}
