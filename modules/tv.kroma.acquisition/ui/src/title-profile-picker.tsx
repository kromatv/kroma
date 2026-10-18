import { useT } from '@kromatv/module-sdk';
import { Box, Select } from '@kromatv/ui/kit';
import { NOT_LISTED } from './not-listed';
import type { RulesView, TitleRulesView } from './rules-schemas';

export function TitleProfilePicker({
  view,
  rules,
  busy,
  onPick,
}: Readonly<{
  view: TitleRulesView;
  rules: RulesView | null;
  busy: boolean;
  onPick: (profileId: string | null) => void;
}>) {
  const t = useT();
  return (
    <Box w={{ base: '100%', md: 220 }}>
      <Select.Root
        label={t('acq.colProfile')}
        value={view.customProfile ? view.profileId : NOT_LISTED}
        disabled={rules === null || busy}
        onValueChange={(next) => onPick(next === NOT_LISTED ? null : next)}
      >
        <Select.Trigger size="sm" block />
        <Select.Item
          value={NOT_LISTED}
          label={t('acq.profileFollowsDefault', { name: defaultName(rules) })}
        />
        {(rules?.profiles ?? []).map((profile) => (
          <Select.Item key={profile.id} value={profile.id} label={profile.name} />
        ))}
      </Select.Root>
    </Box>
  );
}

function defaultName(rules: RulesView | null): string {
  const found = rules?.profiles.find((profile) => profile.id === rules.defaultProfile);
  return found?.name ?? '';
}
