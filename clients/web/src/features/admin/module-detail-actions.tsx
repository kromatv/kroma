// The module page's controls: the enable switch and the install / update /
// uninstall buttons, plus the inline confirmation the page swaps to before an
// uninstall, including the informed-force ask when other modules still depend
// on it.

import type { StoreModule } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, Dialog, Row, Switch, Text } from '@kroma/ui/kit';
import type { AdminModule } from '#web/features/admin/module-api';
import type { ModuleToggle } from '#web/features/admin/module-data';

function ConfirmStrip({
  text,
  danger,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: Readonly<{
  text: string;
  danger: boolean;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const t = useT();
  return (
    <Box gap={12}>
      <Text variant="meta" color={danger ? 'danger' : 'textMuted'}>
        {text}
      </Text>
      <Dialog.Actions
        onCancel={onCancel}
        cancelLabel={t('common.cancel')}
        onConfirm={onConfirm}
        confirmLabel={confirmLabel}
        destructive
        busy={busy}
      />
    </Box>
  );
}

/** The ask before an uninstall: the plain one, or the informed-force variant
 * once the server has answered with the modules that still depend on it. */
export function UninstallConfirm({
  name,
  dependents,
  busy,
  onCancel,
  onConfirm,
}: Readonly<{
  name: string;
  dependents: string[] | null;
  busy: boolean;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}>) {
  const t = useT();
  if (dependents) {
    return (
      <ConfirmStrip
        text={t('admin.modulesUninstallDependentsMsg', { list: dependents.join(', '), name })}
        danger
        confirmLabel={t('admin.modulesUninstallForce')}
        busy={busy}
        onCancel={onCancel}
        onConfirm={() => onConfirm(true)}
      />
    );
  }
  return (
    <ConfirmStrip
      text={t('admin.modulesUninstallMsg', { name })}
      danger={false}
      confirmLabel={t('admin.modulesUninstall')}
      busy={busy}
      onCancel={onCancel}
      onConfirm={() => onConfirm(false)}
    />
  );
}

/** What the page can do to this module, as the header's action row. */
export function ModuleActions({
  installed,
  entry,
  name,
  update,
  toggler,
  onUninstall,
  onInstall,
}: Readonly<{
  installed: AdminModule | undefined;
  entry: StoreModule | undefined;
  name: string;
  update: boolean;
  toggler: ModuleToggle;
  onUninstall: () => void;
  onInstall: () => void;
}>) {
  const t = useT();
  return (
    <Row wrap align="center" gap={12}>
      {installed && (
        <Row gap={8}>
          <Switch
            checked={installed.enabled}
            onCheckedChange={toggler.busy ? undefined : (v) => void toggler.toggle(v)}
            label={name}
          />
          <Text variant="meta" color="textDim">
            {installed.enabled ? t('admin.modulesEnabled') : t('admin.modulesDisabled')}
          </Text>
        </Row>
      )}
      {installed?.removable && (
        <Button
          variant="ghost"
          size="sm"
          label={t('admin.modulesUninstall')}
          onPress={onUninstall}
        />
      )}
      {update && (
        <Button variant="primary" size="sm" label={t('admin.modulesUpdate')} onPress={onInstall} />
      )}
      {!installed && entry?.compatible && (
        <Button variant="primary" size="sm" label={t('admin.modulesInstall')} onPress={onInstall} />
      )}
    </Row>
  );
}
