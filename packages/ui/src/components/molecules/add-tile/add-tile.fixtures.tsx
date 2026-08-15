import { Box } from '#ui/components/atoms/box';

export // The tile is built to sit over artwork, so the story puts it there: on a flat
// panel a ghost outline looks fine, which is exactly how the bare version
// survived three clients before anyone noticed it vanishing on a bright frame.
const ART =
  'url(https://picsum.photos/seed/kroma-gate/1280/720) center / cover, linear-gradient(#1a1a20, #0a0a0c)';

export function OverArt({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Box row center gap={34} p={40} radius="xl" style={{ backgroundImage: ART } as object}>
      {children}
    </Box>
  );
}
