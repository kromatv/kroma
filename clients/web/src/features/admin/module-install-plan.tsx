import type { StoreMissingPoint, StoreOptionalModule, StorePlan } from '@kromatv/client/modules';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Callout, Row, Spinner, Text } from '@kromatv/ui/kit';
import type { AdminModule } from '#web/features/admin/module-api';
import { InstallList } from '#web/features/admin/module-install-list';
import { ConsentSummary } from '#web/features/admin/module-permissions-consent';
import { consentOf } from '#web/features/admin/module-permissions-sources';

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

function MissingWarnings({ missing }: Readonly<{ missing: StoreMissingPoint[] }>) {
  const t = useT();
  if (missing.length === 0) return null;
  return (
    <Box gap={8}>
      {missing.map((m) => (
        <Callout.Root key={`${m.point}:${m.for}`} icon="info-circle">
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

/** The line under an install's title: how many modules it requires and what
 *  it downloads in all. */
export function planSubtitle(
  plan: StorePlan,
  optional: readonly StoreOptionalModule[],
  bytes: (count: number) => string,
  t: Translate,
): string | undefined {
  const optionalIds = new Set(optional.map((module) => module.id));
  const required = plan.modules.filter(
    (module) => module.id !== plan.requested && !optionalIds.has(module.id),
  ).length;
  const brings = required > 0 ? t('admin.modulesInstallWith', { count: required }) : null;
  const size = plan.totalSize > 0 ? bytes(plan.totalSize) : null;
  if (brings && size) return t('admin.modulesInstallSubtitle', { required: brings, size });
  return brings ?? size ?? undefined;
}

/** What an install will do before it starts: the modules it brings, and what
 *  they will be able to do. */
export function PlanBody({
  plan,
  error,
  optional,
  include,
  onIncludeChange,
  icons,
  installed,
}: Readonly<{
  plan: StorePlan | null;
  error: string | null;
  optional: StoreOptionalModule[];
  include: string[];
  onIncludeChange: (next: string[]) => void;
  icons: Readonly<Record<string, string | null | undefined>>;
  installed: readonly AdminModule[];
}>) {
  const t = useT();
  if (error) return <ErrorBox text={error} />;
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
      <InstallList
        plan={plan}
        optional={optional}
        include={include}
        onIncludeChange={onIncludeChange}
        icons={icons}
      />
      <MissingWarnings missing={plan.missing} />
      <ConsentSummary {...consentOf(plan.modules, plan.requested, installed)} />
    </>
  );
}
