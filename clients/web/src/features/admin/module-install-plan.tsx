// The install dialog's plan stage: the resolved module list, the opt-in
// groups (optional deps + point contributors) and the unanswerable-
// requirement warnings. The dialog itself lives in module-install.tsx.

import type {
  StoreMissingPoint,
  StoreOptionalModule,
  StorePlan,
  StorePlanModule,
} from '@kroma/core';
import { useFormat, useT } from '@kroma/ui';
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
  const fmt = useFormat();
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
            {fmt.bytes(m.size)}
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
  const fmt = useFormat();
  if (rows.length === 0) return null;
  const hint = (m: StoreOptionalModule) =>
    [
      m.point && m.for ? t('admin.modulesInstallAnswersFor', { point: m.point, name: m.for }) : '',
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
                    {fmt.bytes(m.size)}
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

function MissingWarnings({ missing }: Readonly<{ missing: StoreMissingPoint[] }>) {
  const t = useT();
  if (missing.length === 0) return null;
  return (
    <Box mt={16} gap={8}>
      {missing.map((m) => (
        <Callout.Root key={`${m.point}:${m.for}`} tone="accent">
          <Callout.Title>
            {t('admin.modulesInstallMissing', {
              point: m.id ? `${m.point}:${m.id}` : m.point,
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
  const fmt = useFormat();
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
        title={t('admin.modulesInstallContributors')}
        rows={optional.filter((m) => m.point)}
        include={include}
        onIncludeChange={onIncludeChange}
      />
      <OptInGroup
        title={t('admin.modulesInstallOptional')}
        rows={optional.filter((m) => !m.point)}
        include={include}
        onIncludeChange={onIncludeChange}
      />
      <MissingWarnings missing={plan.missing} />
      <Row between gap={12} mt={16}>
        <Text variant="meta" color="textDim">
          {plan.totalSize > 0
            ? t('admin.modulesInstallTotal', { size: fmt.bytes(plan.totalSize) })
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
