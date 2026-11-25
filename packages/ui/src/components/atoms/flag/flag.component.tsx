import { Box } from '#ui/components/atoms/box';
import { SvgXml } from '#ui/lib/svg.component';
import { type FlagRegion, flagSvg } from './flags';

interface FlagProps {
  region: FlagRegion;
  /** In px, the side of the square. Defaults to 16. */
  size?: number;
}

/** A country's flag, drawn square from vectors with a hairline edge so a white
 *  field still reads on a white ground. It says nothing to assistive tech: the
 *  words beside it name the thing. */
function Flag({ region, size = 16 }: Readonly<FlagProps>) {
  return (
    <Box w={size} h={size} radius="xs" overflow="hidden" shrink={0} aria-hidden>
      <SvgXml xml={flagSvg(region)} width="100%" height="100%" />
      <Box fill radius="xs" border="tint/16" pointerEvents="none" />
    </Box>
  );
}

export type { FlagProps };
export { Flag };
