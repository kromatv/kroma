// Profile / cast avatar, from the design system. Seeds its gradient from
// `posterColors(name)` — the per-title palette used for artwork placeholders,
// not the five-way profile palette the TV pickers use.

import { posterColors } from '@kroma/core';
import { Avatar as KitAvatar, tintGradient } from '@kroma/ui/kit';

export function Avatar({
  uri,
  name,
  size = 40,
  circle = true,
  locked = false,
}: Readonly<{
  uri: string | null | undefined;
  name: string | null | undefined;
  size?: number;
  /** A disc (a row's mark), or the rounded square the pickers use. */
  circle?: boolean;
  /** Draws the kit's padlock, scaled with the avatar. */
  locked?: boolean;
}>) {
  const label = name?.trim() || '?';
  return (
    <KitAvatar
      name={label}
      src={uri ?? null}
      size={size}
      circle={circle}
      locked={locked}
      gradient={tintGradient(posterColors(label))}
      shadow={false}
    />
  );
}
