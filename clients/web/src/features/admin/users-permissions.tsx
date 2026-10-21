import type { Permission } from '@kromatv/client/accounts';
import { PERMISSIONS } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { ChoiceList } from '@kromatv/ui/kit';
import { useCallback, useState } from 'react';

export function PermPicker({
  selected,
  toggle,
}: Readonly<{
  selected: Set<Permission>;
  toggle: (p: Permission) => void;
}>) {
  const t = useT();
  return (
    <ChoiceList.Root
      mode="multiple"
      size="sm"
      label={t('admin.permissions')}
      value={[...selected]}
      onValueChange={(next) => {
        const moved = diff(selected, next);
        if (moved) toggle(moved);
      }}
    >
      {PERMISSIONS.map((p) => (
        <ChoiceList.Item key={p.key} value={p.key}>
          <ChoiceList.Label>{t(p.labelKey)}</ChoiceList.Label>
          <ChoiceList.Hint>{t(p.hintKey)}</ChoiceList.Hint>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

// <ChoiceList> reports the whole next selection; the caller's toggle takes the
// one entry that moved.
function diff(before: Set<Permission>, after: string[]): Permission | null {
  const next = new Set(after);
  return PERMISSIONS.find((p) => next.has(p.key) !== before.has(p.key))?.key ?? null;
}

export function usePermissionSet(
  initial: Iterable<Permission>,
): [Set<Permission>, (p: Permission) => void] {
  const [perms, setPerms] = useState<Set<Permission>>(() => new Set(initial));
  const toggle = useCallback((p: Permission) => {
    setPerms((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);
  return [perms, toggle];
}
