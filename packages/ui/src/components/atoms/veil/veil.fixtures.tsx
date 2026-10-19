import { Box } from '#ui/components/atoms/box';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { colors } from '#ui/core/tokens';
import { stillArt } from '#ui/lib/sample-art';
import { Veil } from './veil';

/** The detail screen's veil: dark to the left, where the title stands, and up
 *  from the bottom, where the rows begin. */
export const PAGE_VEIL = `linear-gradient(0deg, ${colors.bg} 4%, transparent 60%), linear-gradient(90deg, ${colors.bg} 12%, transparent 68%)`;

export function Backdrop({ veiled = true }: Readonly<{ veiled?: boolean }>) {
  return (
    <Box aspect={16 / 9} overflow="hidden" radius="lg">
      <Img src={stillArt(1)} fill layered />
      {veiled ? <Veil ramp={PAGE_VEIL} /> : null}
      <Box absolute left={24} bottom={24} maxW={260}>
        <Text variant="heading">Un titre posé sur l'image</Text>
      </Box>
    </Box>
  );
}
