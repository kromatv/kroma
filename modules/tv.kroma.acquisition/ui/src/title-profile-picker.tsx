import { useT } from '@kromatv/module-sdk';
import { Box, Row, Select, Text } from '@kromatv/ui/kit';
import type { TitleRulesView } from './judgement-schemas';
import { NOT_LISTED } from './not-listed';
import type { RulesView } from './rules-schemas';

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
    <Row gap={10} align="center" w={{ base: '100%', md: 'auto' }}>
      <Text variant="meta" color="textMuted" shrink={0}>
        {t('acq.colProfile')}
      </Text>
      <Box grow={{ base: 1, md: 0 }} w={{ base: 'auto', md: 240 }}>
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
    </Row>
  );
}

function defaultName(rules: RulesView | null): string {
  const found = rules?.profiles.find((profile) => profile.id === rules.defaultProfile);
  return found?.name ?? '';
}
