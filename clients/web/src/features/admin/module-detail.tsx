// Slide-in module detail drawer: identity, versions,
// dependency graph, add-ons, declared config and the install / update /
// enable / uninstall actions, for installed modules and catalog-only entries
// alike. Uninstall confirms inline in the footer, including the
// informed-force path when other modules still depend on it. Resolves `true`
// when anything changed, so the caller knows whether to refresh.

import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  Dialog,
  Divider,
  Drawer,
  IconButton,
  Row,
  Spacer,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { type ReactNode, useRef, useState } from 'react';
import { createCallable } from 'react-call';
import { message, UninstallConflictError, uninstallModule } from '#web/features/admin/module-api';
import { useModuleData, useModuleToggle } from '#web/features/admin/module-data';
import {
  Addons,
  DepsSection,
  DrawerSettings,
  FooterProgress,
  HeaderIcon,
  Meta,
} from '#web/features/admin/module-detail-sections';
import { InstallModal } from '#web/features/admin/module-install';
import { useStoreOps } from '#web/features/admin/module-ops';
import { Pill } from '#web/features/admin/pill';
import { SCROLL_PANE } from '#web/features/admin/web-style';

/** The inline confirm strip the footer swaps to before an uninstall: the
 * plain ask first, then the informed-force variant listing dependents. */
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

export const ModuleDetailDrawer = createCallable<{ id: string }, boolean>(({ call, id }) => {
  const t = useT();
  const { modules, catalog, reload, refreshAll } = useModuleData();
  const { activeByModule } = useStoreOps();
  const changed = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dependents, setDependents] = useState<string[] | null>(null);

  const all = modules ?? [];
  const installed = all.find((m) => m.id === id);
  const entry = catalog?.modules.find((m) => m.id === id);
  const op = activeByModule.get(id);
  const update = !!entry && entry.updateAvailable && entry.compatible;

  const markChanged = () => {
    changed.current = true;
    void refreshAll();
  };
  const toggler = useModuleToggle(id, markChanged);
  const close = () => call.end(changed.current);

  const install = async () => {
    if (await InstallModal.call({ id })) markChanged();
  };

  const doUninstall = async (force: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await uninstallModule(id, force);
      changed.current = true;
      await refreshAll();
      call.end(true);
    } catch (e) {
      if (e instanceof UninstallConflictError) {
        setDependents(e.dependents);
      } else {
        setError(message(e));
        setRemoving(false);
        setDependents(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const name = installed?.name ?? entry?.name ?? id;
  const version = installed?.version ?? entry?.version;
  const description = installed?.description ?? entry?.description ?? '';
  const metaRows: [string, ReactNode][] = [
    [
      t('admin.modulesVersion'),
      update ? (
        <>
          v{installed?.version} <Text color="accentText">→ v{entry?.version}</Text>
        </>
      ) : (
        `v${version ?? '?'}`
      ),
    ],
  ];
  if (entry?.source) metaRows.push([t('admin.modulesSource'), entry.source]);
  const minServer = entry?.minServer ?? installed?.minServer;
  if (minServer) metaRows.push([t('admin.modulesMinServer'), minServer]);
  if (entry?.target) metaRows.push([t('admin.modulesPlatform'), entry.target]);

  const footer = (() => {
    if (op) return <FooterProgress op={op} />;
    if (dependents) {
      return (
        <ConfirmStrip
          text={t('admin.modulesUninstallDependentsMsg', { list: dependents.join(', '), name })}
          danger
          confirmLabel={t('admin.modulesUninstallForce')}
          busy={busy}
          onCancel={() => setDependents(null)}
          onConfirm={() => void doUninstall(true)}
        />
      );
    }
    if (removing) {
      return (
        <ConfirmStrip
          text={t('admin.modulesUninstallMsg', { name })}
          danger={false}
          confirmLabel={t('admin.modulesUninstall')}
          busy={busy}
          onCancel={() => setRemoving(false)}
          onConfirm={() => void doUninstall(false)}
        />
      );
    }
    return (
      <Row gap={12}>
        {installed && (
          <Row gap={8}>
            <Switch
              checked={installed.enabled}
              onChange={toggler.busy ? undefined : (v) => void toggler.toggle(v)}
              label={name}
            />
            <Text variant="meta" color="textDim">
              {installed.enabled ? t('admin.modulesEnabled') : t('admin.modulesDisabled')}
            </Text>
          </Row>
        )}
        <Spacer />
        {installed?.removable && (
          <Button
            variant="ghost"
            size="sm"
            label={t('admin.modulesUninstall')}
            onPress={() => setRemoving(true)}
          />
        )}
        {update && (
          <Button
            variant="primary"
            size="sm"
            label={t('admin.modulesUpdate')}
            onPress={() => void install()}
          />
        )}
        {!installed && entry?.compatible && (
          <Button
            variant="primary"
            size="sm"
            label={t('admin.modulesInstall')}
            onPress={() => void install()}
          />
        )}
      </Row>
    );
  })();

  return (
    <Drawer open={!call.ended} onClose={close} title={name} width={460}>
      <Box px={24} py={20}>
        <Row between mb={16}>
          <Text variant="overline" color="textDim">
            {t('admin.modulesSheet')}
          </Text>
          <IconButton variant="ghost" icon="x" label={t('common.close')} onPress={close} />
        </Row>
        <Box row align="flex-start" gap={16}>
          <HeaderIcon id={id} installed={!!installed} icon={entry?.icon} />
          <Box minW={0} pt={2}>
            <Text variant="h2" accessibilityRole="header">
              {name}
            </Text>
            <Text variant="meta" font="mono" color="textDim" lines={1} mt={4}>
              {id}
            </Text>
            <Row wrap gap={6} mt={8}>
              {entry?.library && (
                <Pill ink="textMuted" bg="tint/6" variant="overline">
                  {t('admin.modulesLibraryChip')}
                </Pill>
              )}
              {installed && (
                <Pill
                  ink={installed.enabled ? 'success' : 'textDim'}
                  bg={installed.enabled ? 'success/14' : 'tint/6'}
                  variant="overline"
                >
                  {installed.enabled ? t('admin.modulesEnabled') : t('admin.modulesDisabled')}
                </Pill>
              )}
              {update && (
                <Pill ink="accentText" bg="accentSoft" variant="overline">
                  {t('admin.modulesUpdateChip', { version: entry.version })}
                </Pill>
              )}
            </Row>
          </Box>
        </Box>
      </Box>
      <Divider color="tint/7" />

      <div style={SCROLL_PANE}>
        <Box gap={24} px={24} py={20}>
          {(error ?? toggler.error) && (
            <Text variant="meta" color="danger">
              {error ?? toggler.error}
            </Text>
          )}
          {description && (
            <Text variant="meta" color="textMuted">
              {description}
            </Text>
          )}
          {entry && !entry.compatible && entry.reason && (
            <Text variant="meta" color="danger">
              {entry.reason}
            </Text>
          )}
          <Meta rows={metaRows} />
          <DepsSection installed={installed} entry={entry} all={all} />
          <Addons id={id} catalog={catalog} />
          {installed && <DrawerSettings module={installed} onSaved={reload} />}
        </Box>
      </div>

      <Divider color="tint/7" />
      <Box px={24} py={18}>
        {footer}
      </Box>
    </Drawer>
  );
}, 400);
