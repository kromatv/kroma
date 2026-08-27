// The faces a <Dropzone> shows, and the contract both halves are written to.
//
// Their own file because the two Roots are platform variants of each OTHER:
// under web resolution `./dropzone` from inside `dropzone.web` is `dropzone.web`
// itself, so anything shared has to sit outside that pair or the import is a
// cycle that resolves to undefined.

import type { ReactNode } from 'react';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';

export const SURFACE_SHAPE = {
  borderWidth: 1.5,
  borderRadius: 16,
  paddingX: 24,
  paddingY: 28,
  gap: 8,
} as const;

/** A file the zone turned away, with the rule it broke. */
export interface DropzoneRejection {
  file: File;
  reason: 'size' | 'type';
}

export interface DropzoneRootProps {
  /** Names the surface to assistive tech, which cannot read a drawing. A zone
   *  with a `<Dropzone.Title>` may leave it out: the title names it. */
  label?: string;
  /** Comma-separated types, as the native picker takes them (`.torrent`,
   *  `image/*`). Also filters what a DROP is allowed to carry. */
  accept?: string;
  /** Take more than one file. Defaults to one. */
  multiple?: boolean;
  /** Turn away anything larger, in bytes. */
  maxSize?: number;
  disabled?: boolean;
  /** Busy: the surface stops taking files and spins instead. */
  loading?: boolean;
  /** The files that got through. */
  onDrop?: (files: File[]) => void;
  onReject?: (rejections: DropzoneRejection[]) => void;
  /** A `<Dropzone.Icon>`, a `<Dropzone.Title>`, a `<Dropzone.Description>`. */
  children?: ReactNode;
}

/** The glyph above the title. Decorative: the title carries the meaning. */
export function DropzoneIcon({ name = 'file-upload' }: Readonly<{ name?: IconName }>) {
  return <Icon name={name} size={26} thickness={1.6} color="glyphDim" />;
}

/** What the surface takes, in the operator's words. */
export function DropzoneTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <Text variant="label">{children}</Text>;
}

/** The quieter second line: the formats, the size ceiling, how many. */
export function DropzoneDescription({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Text variant="meta" color="text/40">
      {children}
    </Text>
  );
}
