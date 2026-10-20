import type { Release } from '@kromatv/client/releases';
import { Box, Chip, Rail } from '@kromatv/ui/kit';

/** Focusing a version is what picks it. */
export function VersionPicker({
  releases,
  picked,
  onPick,
}: Readonly<{ releases: readonly Release[]; picked: number; onPick: (at: number) => void }>) {
  return (
    <Box flex>
      <Rail.Root gap={4} inset={0} grow={false}>
        {releases.map((release, at) => (
          <Chip
            key={release.version}
            variant="subtle"
            size="tv"
            focusScale={1.04}
            active={at === picked}
            pressed={at === picked}
            label={release.version}
            onFocus={() => onPick(at)}
            onPress={() => onPick(at)}
          />
        ))}
      </Rail.Root>
    </Box>
  );
}
