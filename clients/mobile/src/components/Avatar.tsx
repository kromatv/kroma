// Profile / cast avatar, from the design system.
//
// @kroma/ui's <Avatar> already does exactly this: the photo when it loads,
// otherwise the person's initials on a stable gradient. What stays here is this
// app's call shape and its choice of gradient: the phone seeds it from
// `posterColors(name)`, which is the same per-title palette its artwork
// placeholders use, rather than the five-way profile palette the TV pickers use.

import { posterColors } from '@kroma/core';
import { Avatar as KitAvatar, tintGradient } from '@kroma/ui/kit';

export function Avatar({
  uri,
  name,
  size = 40,
}: Readonly<{
  uri: string | null | undefined;
  name: string | null | undefined;
  size?: number;
}>) {
  const label = name?.trim() || '?';
  return (
    <KitAvatar
      name={label}
      src={uri ?? null}
      size={size}
      circle
      gradient={tintGradient(posterColors(label))}
      shadow={false}
    />
  );
}
