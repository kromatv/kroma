import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { style } from '#ui/core';
import { HAND } from '#ui/lib/cursor';
import { DomOnly } from '#ui/lib/dom-only';
import { DropRoot } from './dropzone-drop-root';
import {
  DropzoneDescription,
  DropzoneIcon,
  type DropzoneRootProps,
  DropzoneTitle,
  SURFACE_SHAPE,
} from './dropzone-parts';

const SURFACE = style({
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: SURFACE_SHAPE.borderWidth,
  borderStyle: 'dashed',
  borderRadius: SURFACE_SHAPE.borderRadius,
  paddingHorizontal: SURFACE_SHAPE.paddingX,
  paddingVertical: SURFACE_SHAPE.paddingY,
});

function PressRoot({ label, disabled = false, children }: Readonly<DropzoneRootProps>) {
  return (
    <Focusable role="button" label={label} disabled={disabled} style={[SURFACE, HAND]}>
      <Box center gap={SURFACE_SHAPE.gap}>
        {children}
      </Box>
    </Focusable>
  );
}

function Root(props: Readonly<DropzoneRootProps>) {
  return (
    <DomOnly fallback={<PressRoot {...props} />}>
      <DropRoot {...props} />
    </DomOnly>
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
