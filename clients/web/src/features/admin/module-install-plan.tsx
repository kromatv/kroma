// The install dialog's plan stage: the resolved module list, the opt-in
// groups (optional deps + capability providers) and the unsatisfiable-
// requirement warnings. The dialog itself lives in module-install.tsx.

import {
  formatBytes,
  type StoreMissingCapability,
  type StoreOptionalModule,
  type StorePlan,
  type StorePlanModule,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Badge,
  Box,
  Button,
  Callout,
  ChoiceList,
  Dialog,
  ListRow,
  Row,
  Spinner,
  Text,
} from '@kroma/ui/kit';

/** The dialog title already says the install failed, so the server's
 * `install failed:` prefix is dropped and the detail (which module, which
 * check refused it) is set small and monospaced instead of a wall of red. */
export function ErrorBox({ text }: Readonly<{ text: string }>) {
  const clean = text.replace(/^install failed:\s*/i, '').replace(/^update failed:\s*/i, '');
  return (
    <Callout.Root tone="danger">
      <Text variant="meta" font="mono" color="danger">
        {clean}
      </Text>
    </Callout.Root>
  );
}

function PlanRow({ m }: Readonly<{ m: StorePlanModule }>) {
  const t = useT();
  return (
    <ListRow.Root size="sm">
      <Row gap={8}>
        <ListRow.Label>{m.name}</ListRow.Label>
        {m.requested ? null : <Badge tone="neutral">{t('admin.modulesInstallDependency')}</Badge>}
      </Row>
      <ListRow.Hint>
        {m.installedVersion ? `v${m.installedVersion} → v${m.version}` : `v${m.version}`}
      </ListRow.Hint>
      {m.size ? (
        <ListRow.Trailing>
          <Text variant="meta" color="textMuted">
            {formatBytes(m.size)}
          </Text>
        </ListRow.Trailing>
      ) : null}
    </ListRow.Root>
  );
}

function OptInGroup({
  title,
  rows,
  include,
  onIncludeChange,
}: Readonly<{
  title: string;
  rows: StoreOptionalModule[];
  include: string[];
  onIncludeChange: (next: string[]) => void;
}>) {
  const t = useT();
  if (rows.length === 0) return null;
  const hint = (m: StoreOptionalModule) =>
    [
      m.capability && m.for
        ? t('admin.modulesInstallProvidesFor', { kind: m.capability, name: m.for })
        : '',
      m.description,
    ]
      .filter(Boolean)
      .join(' · ');
  return (
    <>
      <Text variant="overline" color="textDim" mt={16}>
        {title}
      </Text>
      <Box mt={4}>
        <ChoiceList.Root
          mode="multiple"
          size="sm"
          label={title}
          value={include}
          onValueChange={onIncludeChange}
        >
          {rows.map((m) => (
            <ChoiceList.Item
              key={m.id}
              value={m.id}
              actions={
                m.size ? (
                  <Text variant="meta" color="textMuted">
                    {formatBytes(m.size)}
                  </Text>
                ) : undefined
              }
            >
              <ChoiceList.Label>{`${m.name} v${m.version}`}</ChoiceList.Label>
              {hint(m) ? <ChoiceList.Hint>{hint(m)}</ChoiceList.Hint> : null}
            </ChoiceList.Item>
          ))}
        </ChoiceList.Root>
      </Box>
    </>
  );
}

function MissingWarnings({ missing }: Readonly<{ missing: StoreMissingCapability[] }>) {
  const t = useT();
  if (missing.length === 0) return null;
  return (
    <Box mt={16} gap={8}>
      {missing.map((m) => (
        <Callout.Root key={`${m.kind}:${m.for}`} tone="accent">
          <Callout.Title>
            {t('admin.modulesInstallMissing', {
              kind: m.id ? `${m.kind}:${m.id}` : m.kind,
              name: m.for,
            })}
          </Callout.Title>
        </Callout.Root>
      ))}
    </Box>
  );
}

export function PlanStage({
  plan,
  busy,
  error,
  optional,
  include,
  onIncludeChange,
  onCancel,
  onRun,
}: Readonly<{
  plan: StorePlan | null;
  busy: boolean;
  error: string | null;
  optional: StoreOptionalModule[];
  include: string[];
  onIncludeChange: (next: string[]) => void;
  onCancel: () => void;
  onRun: () => void;
}>) {
  const t = useT();
  if (error) {
    return (
      <>
        <ErrorBox text={error} />
        <Dialog.Actions>
          <Button variant="ghost" size="sm" label={t('common.close')} onPress={onCancel} />
        </Dialog.Actions>
      </>
    );
  }
  if (!plan) {
    return (
      <Row gap={12} py={8}>
        <Spinner size={18} />
        <Text variant="meta" color="textMuted">
          {t('admin.modulesPlanLoading')}
        </Text>
      </Row>
    );
  }
  return (
    <>
      <Text variant="overline" color="textDim">
        {t('admin.modulesInstallPlanIntro')}
      </Text>
      <Box mt={4}>
        <ListRow.Group size="sm">
          {plan.modules.map((m) => (
            <PlanRow key={m.id} m={m} />
          ))}
        </ListRow.Group>
      </Box>
      <OptInGroup
        title={t('admin.modulesInstallProviders')}
        rows={optional.filter((m) => m.capability)}
        include={include}
        onIncludeChange={onIncludeChange}
      />
      <OptInGroup
        title={t('admin.modulesInstallOptional')}
        rows={optional.filter((m) => !m.capability)}
        include={include}
        onIncludeChange={onIncludeChange}
      />
      <MissingWarnings missing={plan.missing} />
      <Row between gap={12} mt={16}>
        <Text variant="meta" color="textDim">
          {plan.totalSize > 0
            ? t('admin.modulesInstallTotal', { size: formatBytes(plan.totalSize) })
            : ''}
        </Text>
        <Row gap={10}>
          <Button variant="ghost" size="sm" label={t('common.cancel')} onPress={onCancel} />
          <Button
            variant="primary"
            size="sm"
            label={t('admin.modulesInstall')}
            onPress={onRun}
            disabled={busy}
          />
        </Row>
      </Row>
    </>
  );
}
