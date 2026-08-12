import { useCallback } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '#ui/components/atoms/button';
import type { IconName } from '#ui/components/atoms/icon';
import { IconButton } from '#ui/components/atoms/icon-button';
import { type CopyState, useCopy } from '#ui/lib/use-copy';

export interface CopyButtonProps {
  /** What lands on the clipboard. */
  value: string;
  label?: string;
  copiedLabel?: string;
  /** Said when the platform refuses the write: an insecure origin, or a
   *  document that does not have focus. */
  failedLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  /** Glyph only, for a control that repeats on every row of a page. `label`
   *  stays the accessible name. */
  iconOnly?: boolean;
}

const GLYPH_FACE = 30;
const GLYPH = 16;

// Indexed rather than nested ternaries: three states, one lookup, and the
// failure is SAID rather than left looking like the press did nothing.
const GLYPH_OF: Record<CopyState, IconName> = {
  idle: 'copy',
  copied: 'check',
  failed: 'alert-triangle',
};

/** Copies `value` and confirms it on the control itself, rather than by toast.
 * Renders nothing where the platform has no clipboard: a television has neither
 * one nor anywhere to paste. */
export function CopyButton({
  value,
  label = 'Copier',
  copiedLabel = 'Copié',
  failedLabel = 'Copie impossible',
  size = 'sm',
  variant = 'outline',
  iconOnly = false,
}: Readonly<CopyButtonProps>) {
  const { available, state, copy } = useCopy();
  const onPress = useCallback(() => copy(value), [copy, value]);

  if (!available) return null;

  // The glyph is the whole confirmation on the icon-only face, so the name has
  // to carry it too or the press reads as having done nothing.
  const said = { idle: label, copied: copiedLabel, failed: failedLabel }[state];

  if (iconOnly) {
    return (
      <IconButton
        variant="ghost"
        diameter={GLYPH_FACE}
        glyph={GLYPH}
        icon={GLYPH_OF[state]}
        label={said}
        onPress={onPress}
      />
    );
  }

  return (
    <Button size={size} variant={variant} icon={GLYPH_OF[state]} label={said} onPress={onPress} />
  );
}
