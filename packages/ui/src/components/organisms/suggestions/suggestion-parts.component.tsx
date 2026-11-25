import { type ReactNode, useState } from 'react';
import { Avatar } from '#ui/components/atoms/avatar';
import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { useMediaPlace } from './suggestion-context';

interface SuggestionMediaProps {
  /** A photo, or a logo under `logo`. While it loads, and where it fails, the
   *  initials of the name it stands beside. */
  src?: string | null;
  /** Draws the picture whole on a light tile, as a company's mark wants, rather
   *  than cropped to fill the place. */
  logo?: boolean;
  /** A glyph the kit sizes, drawn instead of a picture. */
  name?: IconName;
}

const GLYPH_SHARE = 0.6;
const LOGO_PAD_SHARE = 0.12;

/** The mark of a name, at the size and corner the place it stands in gives
 *  it, with that place's name for its initials. */
function SuggestionMedia({ src = null, logo = false, name }: Readonly<SuggestionMediaProps>) {
  const place = useMediaPlace();
  return (
    <Box w={place.size} h={place.size} radius={place.corner} overflow="hidden" center shrink={0}>
      <Mark src={src} logo={logo} glyph={name} />
    </Box>
  );
}

type MarkProps = Readonly<{ src: string | null; logo: boolean; glyph?: IconName }>;

function Mark({ src, logo, glyph }: MarkProps) {
  const { name, size } = useMediaPlace();
  if (glyph) {
    return <Icon name={glyph} size={Math.round(size * GLYPH_SHARE)} color="textMuted" />;
  }
  if (logo && src) {
    return <Logo src={src} />;
  }
  return <Avatar name={name} src={src} size={size} roundness={0} />;
}

function Logo({ src }: Readonly<{ src: string }>) {
  const { name, size } = useMediaPlace();
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) {
    return <Avatar name={name} size={size} roundness={0} />;
  }
  const pad = Math.round(size * LOGO_PAD_SHARE);
  return (
    <Box w={size} h={size} bg="white">
      <Box absolute top={pad} end={pad} bottom={pad} start={pad}>
        <Img
          src={src}
          alt={name}
          fit="contain"
          fill
          placeholder={null}
          onError={() => setFailed(src)}
        />
      </Box>
    </Box>
  );
}

/** The second line of a suggestion. */
function SuggestionHint({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Text variant="meta" color="textDim" lines={1}>
      {children}
    </Text>
  );
}

/** What the list says once something is typed and nothing is left to suggest. */
function SuggestionEmpty({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Box px={12} py={10}>
      {typeof children === 'string' ? (
        <Text variant="meta" color="textDim">
          {children}
        </Text>
      ) : (
        children
      )}
    </Box>
  );
}

export type { SuggestionMediaProps };
export { SuggestionEmpty, SuggestionHint, SuggestionMedia };
