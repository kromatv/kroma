import { useT } from '@kromatv/ui';
import { Box, Button, classes, color, Icon, Row, styles, Text, useStyles } from '@kromatv/ui/kit';

const sDefinition = styles({
  dock: {
    position: 'sticky',
    bottom: 0,
    mt: 24,
    pt: 24,
    pb: 20,
    backgroundImage: `linear-gradient(to top, ${color('bg')} 0%, ${color('bg/90')} 60%, ${color('bg/0')} 100%)`,
  },
});

/** Where a page's save stands: nothing to say, in flight, done, or refused. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function StatusLabel({
  dirty,
  status,
  error,
  savedLabel,
}: Readonly<{ dirty: boolean; status: SaveStatus; error: string | null; savedLabel: string }>) {
  const t = useT();
  if (status === 'saved')
    return (
      <Row gap={8}>
        <Icon name="check" size={16} thickness={2.4} color="success" />
        <Text variant="meta" color="success">
          {savedLabel}
        </Text>
      </Row>
    );
  if (status === 'error')
    return (
      <Text variant="meta" color="danger">
        {error}
      </Text>
    );
  if (dirty)
    return (
      <Row gap={10}>
        <Box w={7} h={7} radius="circle" bg="accent" />
        <Text variant="meta" color="textMuted">
          {t('common.unsaved')}
        </Text>
      </Row>
    );
  return null;
}

/** The bar a page's Save lives in, held to the bottom of the window while the
 * page scrolls under it. It shows only while there is something to save or to
 * say about the last save. Plain CSS underneath: neither `position: sticky`
 * nor a gradient has a React Native spelling. */
export function SaveDock({
  dirty,
  status,
  error,
  savedLabel,
  canSave = dirty,
  onCancel,
  onSave,
}: Readonly<{
  dirty: boolean;
  status: SaveStatus;
  error: string | null;
  savedLabel: string;
  canSave?: boolean;
  onCancel: () => void;
  onSave: () => void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  return (
    <div className={classes(s.dock)}>
      {dirty || status !== 'idle' ? (
        <Row
          between
          gap={16}
          radius="sm"
          border="borderStrong"
          bg="surface2"
          py={12}
          pl={20}
          pr={12}
        >
          <Row minW={0} gap={10}>
            <StatusLabel dirty={dirty} status={status} error={error} savedLabel={savedLabel} />
          </Row>
          <Row shrink={0} gap={10}>
            <Button
              variant="glass"
              size="sm"
              label={t('common.cancel')}
              onPress={onCancel}
              disabled={!dirty || status === 'saving'}
            />
            <Button
              size="sm"
              icon="device-floppy"
              label={status === 'saving' ? t('common.saving') : t('common.save')}
              onPress={onSave}
              loading={status === 'saving'}
              disabled={!canSave || status === 'saving'}
            />
          </Row>
        </Row>
      ) : null}
    </div>
  );
}
