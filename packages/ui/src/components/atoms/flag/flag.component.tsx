import { Box } from '#ui/components/atoms/box';
import { SvgXml } from '#ui/lib/svg.component';
import { type FlagRegion, flagSvg } from './flags';

interface FlagProps {
  region: FlagRegion;
  /** In px. The flag is 3:2, so it is half as wide again. Defaults to 16. */
  height?: number;
}

/** A country's flag, drawn from vectors at 3:2 with a hairline edge so a white
 *  field still reads on a white ground. It says nothing to assistive tech: the
 *  words beside it name the thing. */
function Flag({ region, height = 16 }: Readonly<FlagProps>) {
  return (
    <Box w={height * 1.5} h={height} radius="xs" overflow="hidden" shrink={0} aria-hidden>
      <SvgXml xml={flagSvg(region)} width="100%" height="100%" />
      <Box fill radius="xs" border="tint/16" pointerEvents="none" />
    </Box>
  );
}

export type { FlagProps };
export { Flag };
