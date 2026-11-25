import { type ReactNode, useState } from 'react';
import { Avatar } from '#ui/components/atoms/avatar';
import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { useMediaPlace } from './tag-field-context';

interface TagFieldMediaProps {
  /** A photo, or a logo under `logo`. While it loads, and where it fails, the
   *  initials of the name it stands beside. */
  src?: string | null;
  /** Draws the picture whole on a light tile, as a company's mark wants, rather
   *  than cropped to a disc. */
  logo?: boolean;
  /** A glyph the kit sizes, drawn instead of a picture. */
  name?: IconName;
}

const GLYPH_SHARE = 0.6;
const LOGO_ROUNDNESS = 0.25;
const LOGO_PAD_SHARE = 0.12;

/** The mark of a name: a face, a logo or a glyph. Inside a <TagField.Tag> or a
 *  <TagField.Item>, which size it (a tag's mark is smaller than a row's) and
 *  give it the name its initials are drawn from. In a tag it takes the tag's
 *  corner less its inset, so the two stay concentric. */
function Media({ src = null, logo = false, name }: Readonly<TagFieldMediaProps>) {
  const place = useMediaPlace();
  if (name) {
    return (
      <Box w={place.size} h={place.size} center shrink={0}>
        <Icon name={name} size={Math.round(place.size * GLYPH_SHARE)} color="textMuted" />
      </Box>
    );
  }
  const face = logo && src ? <Logo src={src} /> : <Face src={src} logo={logo} />;
  if (place.corner === undefined) {
    return face;
  }
  return (
    <Box w={place.size} h={place.size} radius={place.corner} overflow="hidden" shrink={0}>
      {face}
    </Box>
  );
}

function Face({ src, logo }: Readonly<{ src: string | null; logo: boolean }>) {
  const place = useMediaPlace();
  const clipped = place.corner !== undefined;
  const roundness = clipped ? 0 : LOGO_ROUNDNESS;
  return (
    <Avatar
      name={place.name}
      src={src}
      size={place.size}
      roundness={logo || clipped ? roundness : undefined}
      circle={!logo && !clipped}
    />
  );
}

function Logo({ src }: Readonly<{ src: string }>) {
  const { name, size, corner: kept } = useMediaPlace();
  const [failed, setFailed] = useState<string | null>(null);
  const clipped = kept !== undefined;
  if (failed === src) {
    return <Avatar name={name} size={size} roundness={clipped ? 0 : LOGO_ROUNDNESS} />;
  }
  const corner = clipped ? 0 : Math.round(size * LOGO_ROUNDNESS);
  const pad = Math.round(size * LOGO_PAD_SHARE);
  return (
    <Box w={size} h={size} radius={corner} bg="white" overflow="hidden" shrink={0}>
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

/** The second line of a <TagField.Item>: what tells two of the same name
 *  apart, as a job and a known work. */
function Hint({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Text variant="meta" color="textDim" lines={1}>
      {children}
    </Text>
  );
}

/** What the list says once something is typed and nothing is left to suggest.
 *  The row that adds the typed text as it is stays under it. */
function Empty({ children }: Readonly<{ children?: ReactNode }>) {
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

export type { TagFieldMediaProps };
export { Empty, Hint, Media };
