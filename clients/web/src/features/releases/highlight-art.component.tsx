import type { HighlightImage } from '@kromatv/client/releases';
import { Box, Divider, Img } from '@kromatv/ui/kit';

export function HighlightArt({ image }: Readonly<{ image: HighlightImage }>) {
  return (
    <>
      <Box aspect={16 / 9} bg="surface1">
        <Img fill src={image.url} alt={image.alt} />
      </Box>
      <Divider />
    </>
  );
}
