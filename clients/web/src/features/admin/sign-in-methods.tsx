import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import {
  Box,
  IconButton,
  type IconName,
  IconWell,
  Row,
  Surface,
  Switch,
  Text,
} from '@kromatv/ui/kit';
import type { BuiltInForm } from '#web/features/admin/sign-in-form';

const BUILT_IN: Record<
  BuiltInForm['kind'],
  { icon: IconName; label: MessageKey; hint: MessageKey }
> = {
  password: {
    icon: 'lock',
    label: 'admin.signInPassword',
    hint: 'admin.signInPasswordHint',
  },
  passkey: {
    icon: 'fingerprint',
    label: 'admin.signInPasskeys',
    hint: 'admin.signInPasskeysHint',
  },
};

/** The two arrows that move a method one place up or down the sign-in
 * screen. An arrow that has nowhere to go is off. */
export function MoveButtons({
  name,
  first,
  last,
  onMove,
}: Readonly<{ name: string; first: boolean; last: boolean; onMove: (by: -1 | 1) => void }>) {
  const t = useT();
  return (
    <Row gap={2} shrink={0}>
      <IconButton
        variant="ghost"
        diameter={30}
        glyph={16}
        icon="arrow-up"
        label={t('admin.signInMoveUp', { name })}
        disabled={first}
        onPress={() => onMove(-1)}
      />
      <IconButton
        variant="ghost"
        diameter={30}
        glyph={16}
        icon="arrow-down"
        label={t('admin.signInMoveDown', { name })}
        disabled={last}
        onPress={() => onMove(1)}
      />
    </Row>
  );
}

/** A built-in method in the list: what it is, its place, and its switch. */
export function BuiltInRow({
  method,
  first,
  last,
  onMove,
  onEnabled,
}: Readonly<{
  method: BuiltInForm;
  first: boolean;
  last: boolean;
  onMove: (by: -1 | 1) => void;
  onEnabled: (enabled: boolean) => void;
}>) {
  const t = useT();
  const words = BUILT_IN[method.kind];
  return (
    <Surface elevated pad="none" radius="xl" border="border">
      <Row between gap={12} px={20} py={16}>
        <Row gap={12} flex minW={0}>
          <IconWell name={words.icon} size="sm" tone="accent" />
          <Box flex minW={0}>
            <Text variant="label">{t(words.label)}</Text>
            <Text variant="meta" color="textDim" mt={2}>
              {t(words.hint)}
            </Text>
          </Box>
        </Row>
        <MoveButtons name={t(words.label)} first={first} last={last} onMove={onMove} />
        <Switch checked={method.enabled} onCheckedChange={onEnabled} label={t(words.label)} />
      </Row>
    </Surface>
  );
}
