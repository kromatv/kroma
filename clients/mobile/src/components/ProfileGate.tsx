// The "Who's watching?" gate: brand lockup, headline and the wrapping grid of
// profile tiles. Presentation only; every tile's action arrives prebuilt from
// the sign-in screen.

import { AddTile, styles } from '@kroma/ui/kit';
import { ScrollView } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { spacing } from '#mobile/lib/theme';
import { OnboardingBox, OnboardingTitle } from './OnboardingScreen';
import { ProfileTile } from './onboarding';
import { ErrorBanner } from './ui';

export type GateTile = {
  key: string;
  name: string;
  caption?: string | null;
  avatarUri: string | null;
  busy?: boolean;
  offline?: boolean;
  locked?: boolean;
  onPress(): void;
};

export function ProfileGate({
  tiles,
  disabled,
  error,
  onAdd,
}: Readonly<{
  tiles: GateTile[];
  disabled: boolean;
  error: string | null;
  onAdd(): void;
}>) {
  const t = useT();
  return (
    <OnboardingBox>
      <OnboardingTitle title={t('auth.whoWatching')} />
      <ScrollView contentContainerStyle={s.grid} style={s.scroll}>
        {tiles.map((tile) => (
          <ProfileTile
            key={tile.key}
            name={tile.name}
            caption={tile.caption}
            avatarUri={tile.avatarUri}
            busy={tile.busy}
            disabled={disabled}
            offline={tile.offline}
            locked={tile.locked}
            onPress={tile.onPress}
          />
        ))}
        <AddTile size="md" label={t('profiles.add')} onPress={onAdd} />
      </ScrollView>
      <ErrorBanner message={error} />
    </OnboardingBox>
  );
}

const s = styles({
  scroll: { grow: 0 },
  grid: {
    row: true,
    wrap: true,
    justify: 'center',
    gap: spacing.lg,
    pt: spacing.md,
    pb: spacing.sm,
  },
});
