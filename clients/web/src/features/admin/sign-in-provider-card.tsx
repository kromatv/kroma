import type { FlowResult } from '@kromatv/client/sso';
import { useT } from '@kromatv/ui';
import {
  Badge,
  Box,
  Button,
  Callout,
  Divider,
  Focusable,
  Icon,
  Row,
  Spacer,
  Surface,
  Switch,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { pictureOf, type ProviderForm, reasonKey } from '#web/features/admin/sign-in-form';
import { MoveButtons } from '#web/features/admin/sign-in-methods';
import { AccessFields } from '#web/features/admin/sign-in-provider-access';
import { ConnectionFields } from '#web/features/admin/sign-in-provider-connection';
import { ProviderMark } from '#web/shared/ui/provider-mark';

const sDefinition = styles({
  header: { row: true, align: 'center', gap: 12, px: 20, py: 16 },
});

function hostOf(issuer: string): string {
  try {
    return new URL(issuer).host;
  } catch {
    return issuer;
  }
}

function StatusBadge({ provider: p }: Readonly<{ provider: ProviderForm }>) {
  const t = useT();
  if (!p.enabled) return <Badge tone="neutral">{t('admin.signInOff')}</Badge>;
  if (p.live) return <Badge tone="success">{t('admin.signInLive')}</Badge>;
  return <Badge tone="warning">{t('admin.signInNotTested')}</Badge>;
}

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

/** One provider as an expandable card: who it is and whether people can use
 * it, then everything an admin sets about it. */
export function ProviderCard({
  provider: p,
  expanded,
  first,
  last,
  unsaved,
  testing,
  result,
  onToggle,
  onMove,
  onChange,
  onPicture,
  onTest,
  onRemove,
}: Readonly<{
  provider: ProviderForm;
  expanded: boolean;
  first: boolean;
  last: boolean;
  /** The page holds changes the server has not seen, so a test would not try
   *  what is on screen. */
  unsaved: boolean;
  testing: boolean;
  /** What the last test sign-in at this provider returned, if this page load
   *  came back from one. */
  result: FlowResult | null;
  onToggle: () => void;
  onMove: (by: -1 | 1) => void;
  onChange: (patch: Partial<ProviderForm>) => void;
  /** The provider's picture changed on the server. */
  onPicture: () => void;
  onTest: () => void;
  onRemove: () => void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const name = p.label || t('admin.signInUntitled');

  return (
    <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
      <Row gap={4} pr={12}>
        <Box flex minW={0}>
          <Focusable
            ring="focusInset"
            style={s.header}
            label={name}
            expanded={expanded}
            onPress={onToggle}
          >
            <Box center w={38} h={38} shrink={0}>
              <ProviderMark icon={p.icon} image={pictureOf(p)} size={30} />
            </Box>
            <Box flex minW={0}>
              <Row gap={8}>
                <Text variant="label" lines={1}>
                  {name}
                </Text>
                <StatusBadge provider={p} />
                {p.fromEnv ? <Badge tone="neutral">{t('admin.signInFromEnv')}</Badge> : null}
              </Row>
              <Text variant="meta" color="textDim" lines={1} mt={2}>
                {p.issuer ? hostOf(p.issuer) : t('admin.signInNoAddress')}
              </Text>
            </Box>
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="textDim" />
          </Focusable>
        </Box>
        <MoveButtons name={name} first={first} last={last} onMove={onMove} />
      </Row>

      {expanded ? (
        <>
          <Divider />
          <Box px={20} pt={20}>
            <ConnectionFields provider={p} set={onChange} onPicture={onPicture} />
            <AccessFields provider={p} set={onChange} />

            <Row between gap={16} mb={16} maxW={560}>
              <Box minW={0}>
                <Text variant="label">{t('admin.signInEnabled')}</Text>
                <Text variant="meta" color="textDim" mt={2}>
                  {t('admin.signInEnabledHint')}
                </Text>
              </Box>
              <Switch
                checked={p.enabled}
                onCheckedChange={(enabled) => onChange({ enabled })}
                label={t('admin.signInEnabled')}
              />
            </Row>

            {result ? (
              <Box mb={16} maxW={560}>
                <TestResult result={result} />
              </Box>
            ) : null}

            <Row wrap gap={10} mt={8} mb={20}>
              <Button
                variant="glass"
                size="sm"
                icon="plug-connected"
                label={testing ? t('admin.signInTesting') : t('admin.signInTest')}
                onPress={onTest}
                loading={testing}
                disabled={testing || unsaved || !p.id}
              />
              {unsaved || !p.id ? (
                <Text variant="meta" color="textDim">
                  {t('admin.signInSaveFirst')}
                </Text>
              ) : null}
              <Spacer />
              {p.fromEnv ? null : (
                <Button
                  variant="dangerGhost"
                  size="sm"
                  icon="trash"
                  label={t('admin.signInRemove')}
                  onPress={onRemove}
                />
              )}
            </Row>
          </Box>
        </>
      ) : null}
    </Surface>
  );
}
