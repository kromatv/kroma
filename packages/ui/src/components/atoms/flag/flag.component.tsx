import { Box } from '#ui/components/atoms/box';
import { SvgXml } from '#ui/lib/svg.component';
import { useFlagSvg } from './use-flag-svg.hook';

interface FlagProps {
  /** Uppercase ISO 3166. A browser fetches each flag the first time it is drawn. */
  region: string;
  /** In px, the side of the square. Defaults to 16. */
  size?: number;
}

/** A country's flag, drawn square from vectors with a hairline edge so a white
 *  field still reads on a white ground. It says nothing to assistive tech: the
 *  words beside it name the thing. */
function Flag({ region, size = 16 }: Readonly<FlagProps>) {
  const svg = useFlagSvg(region);
  return (
    <Box w={size} h={size} radius="xs" bg="tint/8" overflow="hidden" shrink={0} aria-hidden>
      {svg === undefined ? null : <SvgXml xml={svg} width="100%" height="100%" />}
      <Box fill radius="xs" border="tint/16" pointerEvents="none" />
    </Box>
  );
}

export type { FlagProps };
export { Flag };
