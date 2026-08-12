import { Avatar } from '@kroma/ui/kit';
import { imageUrl } from '#web/shared/lib/api';

// The deterministic gradient + initials are the design system's own, so an
// account keeps the same colour on the TV, the phone and here.
export { gradientFor as avatarGradient, initialsOf as initials } from '@kroma/ui/kit';

/**
 * Account avatar in the KROMA shape: a rounded-square gradient with Bricolage
 * initials, with the uploaded WebP photo layered over it once loaded (the kit
 * Avatar handles the swap, so SSR shows initials and the photo fades in).
 */
export function UserAvatar({
  name,
  avatarUrl,
  seed,
  size = 138,
  radius,
  className = '',
}: Readonly<{
  name: string;
  avatarUrl?: string | null;
  seed?: string;
  size?: number;
  radius?: number;
  className?: string;
}>) {
  const corner = radius ?? Math.round(size * 0.13);
  return (
    // Block, sized and rounded to exactly the avatar's box: callers put their
    // shadow/ring classes HERE, and a box-shadow only traces a rounded corner
    // the element itself has - while `inline` would add the line box's
    // descender under the disc and shift anything absolutely positioned
    // against the tile (the padlock overlay).
    <span
      className={className}
      style={{ display: 'block', width: size, height: size, borderRadius: corner }}
    >
      <Avatar
        name={name}
        seed={seed}
        src={avatarUrl ? imageUrl(avatarUrl) : null}
        size={size}
        roundness={corner / size}
        shadow={false}
      />
    </span>
  );
}
