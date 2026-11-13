import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Divider, type IconName, IconWell, Row, Surface, Switch, Text } from '@kromatv/ui/kit';
import type { SignInForm } from '#web/features/admin/sign-in-form';

function MethodRow({
  icon,
  labelKey,
  hintKey,
  checked,
  onChange,
}: Readonly<{
  icon: IconName;
  labelKey: MessageKey;
  hintKey: MessageKey;
  checked: boolean;
  onChange: (checked: boolean) => void;
}>) {
  const t = useT();
  return (
    <Row between gap={16} px={22} py={18}>
      <Row gap={14} flex minW={0}>
        <IconWell name={icon} size="sm" tone="accent" />
        <Box flex minW={0}>
          <Text variant="label">{t(labelKey)}</Text>
          <Text variant="meta" color="textDim" mt={2}>
            {t(hintKey)}
          </Text>
        </Box>
      </Row>
      <Switch checked={checked} onCheckedChange={onChange} label={t(labelKey)} />
    </Row>
  );
}

/** The two ways in that every server has, each with its switch. */
export function MethodSwitches({
  form,
  update,
}: Readonly<{ form: SignInForm; update: (patch: Partial<SignInForm>) => void }>) {
  return (
    <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
      <MethodRow
        icon="lock"
        labelKey="admin.signInPassword"
        hintKey="admin.signInPasswordHint"
        checked={form.password}
        onChange={(password) => update({ password })}
      />
      <Divider />
      <MethodRow
        icon="fingerprint"
        labelKey="admin.signInPasskeys"
        hintKey="admin.signInPasskeysHint"
        checked={form.passkeys}
        onChange={(passkeys) => update({ passkeys })}
      />
    </Surface>
  );
}
