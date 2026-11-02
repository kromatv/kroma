import type { StoreOptionalModule, StorePlan, StorePlanModule } from '@kromatv/client/modules';
import type { Translate } from '@kromatv/i18n';
import { useFormat, useT } from '@kromatv/ui';
import { CheckboxFace, IconWell, ListRow, Row, Text } from '@kromatv/ui/kit';

type Icons = Readonly<Record<string, string | null | undefined>>;

function plannedHint(module: StorePlanModule, requested: boolean, t: Translate): string | null {
  const from = module.installedVersion;
  if (from) {
    return t(requested ? 'admin.modulesInstallUpdate' : 'admin.modulesInstallRequiredUpdate', {
      from,
    });
  }
  return requested ? null : t('admin.modulesInstallRequired');
}

function optionalHint(module: StoreOptionalModule, t: Translate): string {
  if (!module.for) return t('admin.modulesInstallOptional');
  return t(
    module.suggested ? 'admin.modulesInstallSuggestedFor' : 'admin.modulesInstallOptionalFor',
    { name: module.for },
  );
}

function Size({ bytes }: Readonly<{ bytes: number | null | undefined }>) {
  const fmt = useFormat();
  if (!bytes) return null;
  return (
    <Text variant="meta" color="textMuted">
      {fmt.bytes(bytes)}
    </Text>
  );
}

function PlannedRow({
  module,
  requested,
  icon,
}: Readonly<{ module: StorePlanModule; requested: boolean; icon: string | null | undefined }>) {
  const t = useT();
  const hint = plannedHint(module, requested, t);
  return (
    <ListRow.Root size="sm" chevron={false}>
      <ListRow.Leading>
        <IconWell name="puzzle" size="xs" src={icon} />
      </ListRow.Leading>
      <ListRow.Label>{module.name}</ListRow.Label>
      {hint ? <ListRow.Hint>{hint}</ListRow.Hint> : null}
      <ListRow.Trailing>
        <Size bytes={module.size} />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function OptionalRow({
  module,
  bytes,
  icon,
  checked,
  onToggle,
}: Readonly<{
  module: StoreOptionalModule;
  bytes: number | null | undefined;
  icon: string | null | undefined;
  checked: boolean;
  onToggle: () => void;
}>) {
  const t = useT();
  return (
    <ListRow.Root size="sm" role="checkbox" checked={checked} chevron={false} onPress={onToggle}>
      <ListRow.Leading>
        <IconWell name="puzzle" size="xs" src={icon} />
      </ListRow.Leading>
      <ListRow.Label>{module.name}</ListRow.Label>
      <ListRow.Hint>{optionalHint(module, t)}</ListRow.Hint>
      <ListRow.Trailing>
        <Row gap={14}>
          <Size bytes={bytes} />
          <CheckboxFace checked={checked} size="sm" />
        </Row>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

/** Every module an install brings, each once: the one asked for, what it
 *  requires, and the optional ones the operator ticks in the same list. */
export function InstallList({
  plan,
  optional,
  include,
  onIncludeChange,
  icons,
}: Readonly<{
  plan: StorePlan;
  optional: readonly StoreOptionalModule[];
  include: readonly string[];
  onIncludeChange: (next: string[]) => void;
  icons: Icons;
}>) {
  const optionalIds = new Set(optional.map((module) => module.id));
  const planned = plan.modules.filter((module) => !optionalIds.has(module.id));
  const ordered = [
    ...planned.filter((module) => module.id === plan.requested),
    ...planned.filter((module) => module.id !== plan.requested),
  ];
  const toggle = (id: string) =>
    onIncludeChange(include.includes(id) ? include.filter((one) => one !== id) : [...include, id]);
  return (
    <ListRow.Group size="sm">
      {ordered.map((module) => (
        <PlannedRow
          key={module.id}
          module={module}
          requested={module.id === plan.requested}
          icon={icons[module.id]}
        />
      ))}
      {optional.map((module) => (
        <OptionalRow
          key={module.id}
          module={module}
          bytes={plan.modules.find((one) => one.id === module.id)?.size ?? module.size}
          icon={icons[module.id]}
          checked={include.includes(module.id)}
          onToggle={() => toggle(module.id)}
        />
      ))}
    </ListRow.Group>
  );
}
