// The pointer-and-filesystem half of <Dropzone>: the drag listeners and the
// hidden native input that does the actual picking. The two rules a zone
// enforces are in ./dropzone-sift.

import { type DragEvent, type KeyboardEvent, useCallback, useRef, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Spinner } from '#ui/components/atoms/spinner';
import { styles } from '#ui/core';
import { classes } from '#ui/lib/classed';
import {
  DropzoneDescription,
  DropzoneIcon,
  type DropzoneRootProps,
  DropzoneTitle,
  SURFACE_SHAPE,
} from './dropzone-parts';
import { sift } from './dropzone-sift';

const s = styles({
  surface: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SURFACE_SHAPE.gap,
    borderWidth: SURFACE_SHAPE.borderWidth,
    borderStyle: 'dashed',
    borderRadius: SURFACE_SHAPE.borderRadius,
    py: SURFACE_SHAPE.paddingY,
    px: SURFACE_SHAPE.paddingX,
    transition: 'border-color 140ms ease, background 140ms ease',
  },
  rest: { borderColor: 'border', bg: 'transparent' },
  over: { borderColor: 'accent', bg: 'accentSoft' },
  hand: { cursor: 'pointer' },
  inert: { cursor: 'default' },
  dim: { opacity: 0.5 },
  hidden: { display: 'none' },
});

function Root({
  label,
  accept,
  multiple = false,
  maxSize,
  disabled = false,
  loading = false,
  onDrop,
  onReject,
  children,
}: Readonly<DropzoneRootProps>) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const inert = disabled || loading;

  const take = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const { taken, turned } = sift([...files], { accept, maxSize, multiple });
      if (turned.length > 0) onReject?.(turned);
      if (taken.length > 0) onDrop?.(taken);
    },
    [accept, maxSize, multiple, onDrop, onReject],
  );

  const onDropped = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setOver(false);
    if (!inert) take(e.dataTransfer?.files ?? null);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (inert || (e.key !== 'Enter' && e.key !== ' ')) return;
    // Space would scroll the dialog under the zone.
    e.preventDefault();
    input.current?.click();
  };

  return (
    <>
      <button
        type="button"
        aria-label={label}
        disabled={inert}
        data-drag-active={over || undefined}
        onClick={() => input.current?.click()}
        onKeyDown={onKey}
        onDragOver={(e) => {
          e.preventDefault();
          if (!inert) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDropped}
        className={classes(
          s.surface,
          over ? s.over : s.rest,
          inert ? s.inert : s.hand,
          disabled ? s.dim : null,
        )}
      >
        <Box center gap={SURFACE_SHAPE.gap}>
          {loading ? <Spinner /> : children}
        </Box>
      </button>
      {/* Beside the button, not inside it: nesting one interactive element in
          another is invalid, and this one is what actually opens the picker. */}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={inert}
        aria-label={label}
        tabIndex={-1}
        className={classes(s.hidden)}
        onChange={(e) => {
          take(e.target.files);
          // Cleared so picking the SAME file again still fires a change.
          e.target.value = '';
        }}
      />
    </>
  );
}

/** A surface files are dropped on, or clicked to browse for. See ./dropzone. */
const Dropzone = {
  Root,
  Icon: DropzoneIcon,
  Title: DropzoneTitle,
  Description: DropzoneDescription,
};

export type { DropzoneRejection, DropzoneRootProps } from './dropzone-parts';
export { Dropzone };
