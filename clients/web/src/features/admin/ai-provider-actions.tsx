import { useT } from '@kroma/ui';
import { Button, Icon, Row, Spacer, Text } from '@kroma/ui/kit';
import type { Busy, Probe } from '#web/features/admin/ai-provider-spec';

const DANGER_LABEL = { fontSize: 13, fontWeight: '600' } as const;

export function CardActions({
  busy,
  isDefault,
  probe,
  onTest,
  onSetDefault,
  onRemove,
}: Readonly<{
  busy: Busy;
  isDefault: boolean;
  probe: Probe;
  onTest: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
}>) {
  const t = useT();
  return (
    <Row wrap gap={10} mt={8} mb={20}>
      <Button
        variant="glass"
        size="sm"
        label={busy === 'test' ? t('admin.aiTesting') : t('admin.aiTest')}
        icon="plug-connected"
        onPress={onTest}
        disabled={busy !== 'idle'}
      />
      {!isDefault ? (
        <Button
          variant="glass"
          size="sm"
          label={t('admin.aiSetDefault')}
          icon="star"
          onPress={onSetDefault}
        />
      ) : null}
      {probe ? (
        <Row gap={6}>
          <Icon
            name={probe.ok ? 'check' : 'x'}
            size={15}
            thickness={2.4}
            color={probe.ok ? 'success' : 'danger'}
          />
          <Text variant="meta" color={probe.ok ? 'success' : 'danger'}>
            {probe.text}
          </Text>
        </Row>
      ) : null}
      <Spacer />
      <Button variant="ghost" size="sm" onPress={onRemove}>
        <Icon name="trash" size={15} color="danger" />
        <Text color="danger" style={DANGER_LABEL}>
          {t('admin.aiRemoveProvider')}
        </Text>
      </Button>
    </Row>
  );
}
