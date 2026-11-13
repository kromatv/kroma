import type { FlowResult } from '@kromatv/client/sso';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, Row, Text } from '@kromatv/ui/kit';
import { type ProviderForm, reasonKey } from '#web/features/admin/sign-in-form';

function TestResult({ result }: Readonly<{ result: FlowResult }>) {
  const t = useT();
  if (result.status === 'tested') {
    const { report } = result;
    const who = report.email ?? report.username ?? report.name ?? report.subject;
    return (
      <Callout.Root tone={report.admitted ? 'success' : 'accent'} icon="circle-check">
        <Callout.Title>{t('admin.signInTestPassed', { who })}</Callout.Title>
        <Callout.Detail>
          {report.groups.length > 0
            ? t('admin.signInTestGroups', { groups: report.groups.join(', ') })
            : t('admin.signInTestNoGroups')}{' '}
          {report.admitted ? t('admin.signInTestAdmitted') : t('admin.signInTestNotAdmitted')}
        </Callout.Detail>
      </Callout.Root>
    );
  }
  const reason = result.status === 'failed' || result.status === 'refused' ? result.reason : '';
  const key = reasonKey(reason);
  return (
    <Callout.Root tone="danger" icon="alert-triangle">
      <Callout.Title>{t('admin.signInTestFailed')}</Callout.Title>
      <Callout.Detail>{key ? t(key) : t('sso.reason.other', { reason })}</Callout.Detail>
    </Callout.Root>
  );
}

/** The test sign-in that takes a provider live: its button, what the last one
 * showed, and what stands between the provider and the sign-in screen. */
export function TestFields({
  provider: p,
  unsaved,
  testing,
  result,
  onTest,
}: Readonly<{
  provider: ProviderForm;
  unsaved: boolean;
  testing: boolean;
  result: FlowResult | null;
  onTest: () => void;
}>) {
  const t = useT();
  const blocked = unsaved || !p.id;
  const waiting = p.live ? null : t('admin.signInEnabledHint');
  const hint = blocked ? t('admin.signInSaveFirst') : waiting;
  return (
    <Box>
      <Text variant="overline" color="textDim" mb={12}>
        {t('admin.signInSectionTest')}
      </Text>
      {result ? (
        <Box mb={12} maxW={560}>
          <TestResult result={result} />
        </Box>
      ) : null}
      <Row wrap gap={12}>
        <Button
          variant={p.live || blocked ? 'glass' : 'primary'}
          size="sm"
          icon="plug-connected"
          label={testing ? t('admin.signInTesting') : t('admin.signInTest')}
          onPress={onTest}
          loading={testing}
          disabled={testing || blocked}
        />
        {hint ? (
          <Text variant="meta" color="textDim">
            {hint}
          </Text>
        ) : null}
      </Row>
    </Box>
  );
}
