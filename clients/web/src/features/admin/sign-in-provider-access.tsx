import type { Permission } from '@kromatv/client/accounts';
import { NewPeople } from '@kromatv/client/sso';
import { useT } from '@kromatv/ui';
import { Box, Field, SegmentGroup, Text } from '@kromatv/ui/kit';
import { LibraryVisibility } from '#web/features/admin/library-visibility';
import type { ProviderForm } from '#web/features/admin/sign-in-form';
import { PermPicker } from '#web/features/admin/users-permissions';

const NEW_PEOPLE_HINT = {
  ask: 'admin.signInNewAskHint',
  create: 'admin.signInNewCreateHint',
  invite: 'admin.signInNewInviteHint',
} as const;

/** Who a provider lets in: the groups a person must be in, and what happens
 * to someone the server has never seen. */
export function AccessFields({
  provider: p,
  set,
}: Readonly<{ provider: ProviderForm; set: (patch: Partial<ProviderForm>) => void }>) {
  const t = useT();
  const toggle = (permission: Permission) =>
    set({
      permissions: p.permissions.includes(permission)
        ? p.permissions.filter((held) => held !== permission)
        : [...p.permissions, permission],
    });

  return (
    <>
      <Text variant="overline" color="textDim" mt={8} mb={12}>
        {t('admin.signInWhoGetsIn')}
      </Text>

      <Field.Root label={t('admin.signInRequiredGroups')} maxW={560} mb={16}>
        <Field.Input
          icon="users-group"
          value={p.requiredGroups}
          onValueChange={(requiredGroups) => set({ requiredGroups })}
          placeholder={t('admin.signInRequiredGroupsPlaceholder')}
        />
        <Field.Hint>{t('admin.signInRequiredGroupsHint')}</Field.Hint>
      </Field.Root>

      <Field.Root label={t('admin.signInNewPeople')} mb={16}>
        <SegmentGroup.Root
          value={p.newPeople}
          onValueChange={(value) => set({ newPeople: NewPeople.parse(value) })}
        >
          <SegmentGroup.Item value="ask">
            <SegmentGroup.Label>{t('admin.signInNewAsk')}</SegmentGroup.Label>
          </SegmentGroup.Item>
          <SegmentGroup.Item value="create">
            <SegmentGroup.Label>{t('admin.signInNewCreate')}</SegmentGroup.Label>
          </SegmentGroup.Item>
          <SegmentGroup.Item value="invite">
            <SegmentGroup.Label>{t('admin.signInNewInvite')}</SegmentGroup.Label>
          </SegmentGroup.Item>
        </SegmentGroup.Root>
        <Field.Hint>{t(NEW_PEOPLE_HINT[p.newPeople])}</Field.Hint>
      </Field.Root>

      {p.newPeople === 'create' ? (
        <Box gap={16} mb={16} maxW={560}>
          <PermPicker selected={new Set(p.permissions)} toggle={toggle} />
          <LibraryVisibility
            granted={p.libraries}
            onChange={(next) => set({ libraries: next === null ? null : [...next] })}
          />
        </Box>
      ) : null}
    </>
  );
}
