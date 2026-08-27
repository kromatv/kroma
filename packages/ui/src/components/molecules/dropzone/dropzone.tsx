// <Dropzone>: the surface a file is dropped on, or clicked to browse for.
//
// Dragging a file from the desktop is a POINTER-and-filesystem idea, and a
// television has neither, so the native targets render the surface as a plain
// pressable that reports its press and nothing else: a shell that wants to open
// a picker there does it with the platform's own. The half that listens for
// drags, reads the files and enforces `accept` / `maxSize` is in ./dropzone.web.

import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { HAND } from '#ui/lib/cursor';
import {
  DropzoneDescription,
  DropzoneIcon,
  type DropzoneRootProps,
  DropzoneTitle,
  SURFACE_SHAPE,
} from './dropzone-parts';

const SURFACE = {
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: SURFACE_SHAPE.borderWidth,
  borderStyle: 'dashed',
  borderRadius: SURFACE_SHAPE.borderRadius,
  paddingHorizontal: SURFACE_SHAPE.paddingX,
  paddingVertical: SURFACE_SHAPE.paddingY,
} as const;

function Root({ label, disabled = false, children }: Readonly<DropzoneRootProps>) {
  return (
    <Focusable role="button" label={label} disabled={disabled} style={[SURFACE, HAND]}>
      <Box center gap={SURFACE_SHAPE.gap}>
        {children}
      </Box>
    </Focusable>
  );
}

/**
 * A surface files are dropped on, or clicked to browse for.
 *
 * ```tsx
 * <Dropzone.Root accept=".torrent" maxSize={1024 * 1024} onDrop={([file]) => queue(file)}>
 *   <Dropzone.Icon />
 *   <Dropzone.Title>Drop a .torrent here</Dropzone.Title>
 *   <Dropzone.Description>or click to browse</Dropzone.Description>
 * </Dropzone.Root>
 * ```
 */
const Dropzone = {
  Root,
  Icon: DropzoneIcon,
  Title: DropzoneTitle,
  Description: DropzoneDescription,
};

export type { DropzoneRejection, DropzoneRootProps } from './dropzone-parts';
export { Dropzone };
