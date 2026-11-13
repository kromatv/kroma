import type { FlowResult } from '@kromatv/client/sso';
import { useT } from '@kromatv/ui';
import {
  Badge,
  Box,
  Button,
  Divider,
  Focusable,
  Icon,
  Row,
  Surface,
  Switch,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import {
  markOf,
  type PresetCatalog,
  type ProviderForm,
  presetOf,
} from '#web/features/admin/sign-in-form';
import { MoveButtons } from '#web/features/admin/sign-in-methods';
import { AccessFields } from '#web/features/admin/sign-in-provider-access';
import { ButtonFields } from '#web/features/admin/sign-in-provider-button';
import { ConnectionFields } from '#web/features/admin/sign-in-provider-connection';
import { TestFields } from '#web/features/admin/sign-in-provider-test';
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

/** One provider as an expandable card. The row says who it is, whether people
 * can use it, where it sits and whether it is on, like a built-in method's.
 * Opened, it holds everything an admin sets about it, in the order they need
 * it: the button, the connection, the test, then who gets in. */
export function ProviderCard({
  provider: p,
  catalog,
  redirectUris,
  expanded,
  first,
  last,
  unsaved,
  testing,
  result,
  onToggle,
  onMove,
  onChange,
  onTest,
  onRemove,
}: Readonly<{
  provider: ProviderForm;
  catalog: PresetCatalog;
  redirectUris: readonly string[];
  expanded: boolean;
  first: boolean;
  last: boolean;
  unsaved: boolean;
  testing: boolean;
  result: FlowResult | null;
  onToggle: () => void;
  onMove: (by: -1 | 1) => void;
  onChange: (patch: Partial<ProviderForm>) => void;
  onTest: () => void;
  onRemove: () => void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const name = p.label || t('admin.signInUntitled');

  return (
    <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
      <Row gap={12} pr={20}>
        <Box flex minW={0}>
          <Focusable
            ring="focusInset"
            style={s.header}
            label={name}
            expanded={expanded}
            onPress={onToggle}
          >
            <Box center w={38} h={38} shrink={0}>
              <ProviderMark icon={p.icon} image={markOf(catalog, p.preset)} size={30} />
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
        <Switch
          checked={p.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
          label={t('admin.signInShow', { name })}
        />
      </Row>

      {expanded ? (
        <>
          <Divider />
          <Box p={20} gap={24}>
            <Box>
              <ButtonFields provider={p} catalog={catalog} set={onChange} />
            </Box>
            <Box>
              <ConnectionFields
                provider={p}
                preset={presetOf(catalog, p.preset)}
                redirectUris={redirectUris}
                set={onChange}
              />
            </Box>
            <TestFields
              provider={p}
              unsaved={unsaved}
              testing={testing}
              result={result}
              onTest={onTest}
            />
            <Box>
              <AccessFields provider={p} set={onChange} />
            </Box>
            {p.fromEnv ? null : (
              <Row justify="flex-end">
                <Button
                  variant="dangerGhost"
                  size="sm"
                  icon="trash"
                  label={t('admin.signInRemove')}
                  onPress={onRemove}
                />
              </Row>
            )}
          </Box>
        </>
      ) : null}
    </Surface>
  );
}
