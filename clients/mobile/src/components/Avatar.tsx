// Profile / cast avatar, from the design system. Seeds its gradient from
// `posterColors(name)` — the per-title palette used for artwork placeholders,
// not the five-way profile palette the TV pickers use.

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
