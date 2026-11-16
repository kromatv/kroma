import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { IconButton } from '#ui/components/atoms/icon-button';
import { CROP_IDENTITY } from '#ui/lib/crop-geometry';
import { CONTROL } from '#ui/lib/field-shell';
import { useCropperPart } from './cropper-context.hook';

const TOOL_GAP = 8;
const GLYPH = Math.round(CONTROL.sm.height * 0.4);

interface ToolProps {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}

function Tool({ icon, label, disabled, onPress }: Readonly<ToolProps>) {
  return (
    <IconButton
      variant={disabled ? 'ghost' : 'glass'}
      control="sm"
      label={label}
      disabled={disabled}
      onPress={onPress}
    >
      <Icon name={icon} size={GLYPH} color={disabled ? 'glyphDim' : 'text'} />
    </IconButton>
  );
}

interface CropperZoomProps {
  /** Names the further control to assistive tech, `Zoom out` by default. */
  outLabel?: string;
  /** Names the closer control to assistive tech, `Zoom in` by default. */
  inLabel?: string;
  /** How much zoom one press adds or takes, 0.25 by default. */
  step?: number;
}

/** Two controls, further and closer. Each stops being a focus stop at its end of the Root's zoom range. */
function Zoom({
  outLabel = 'Zoom out',
  inLabel = 'Zoom in',
  step = 0.25,
}: Readonly<CropperZoomProps>) {
  const { src, transform, minZoom, maxZoom, zoomBy } = useCropperPart('Zoom');
  const empty = src === null;
  return (
    <Box row gap={TOOL_GAP}>
      <Tool
        icon="zoom-out"
        label={outLabel}
        disabled={empty || transform.zoom <= Math.max(minZoom, 1)}
        onPress={() => zoomBy(-step)}
      />
      <Tool
        icon="zoom-in"
        label={inLabel}
        disabled={empty || transform.zoom >= Math.max(maxZoom, 1)}
        onPress={() => zoomBy(step)}
      />
    </Box>
  );
}

interface CropperRotateProps {
  /** Counter-clockwise (`left`, the default) or clockwise, as the viewer sees it. */
  direction?: 'left' | 'right';
  /** Names the control to assistive tech, `Rotate` by default. */
  label?: string;
}

/** Turns the picture a quarter. */
function Rotate({ direction = 'left', label = 'Rotate' }: Readonly<CropperRotateProps>) {
  const { src, rotate } = useCropperPart('Rotate');
  return (
    <Tool
      icon={direction === 'left' ? 'rotate-2' : 'rotate-clockwise-2'}
      label={label}
      disabled={src === null}
      onPress={() => rotate(direction)}
    />
  );
}

interface CropperResetProps {
  /** Names the control to assistive tech, `Reset` by default. */
  label?: string;
}

/** Puts the picture back upright, centred and just covering. Not a focus stop while it already is. */
function Reset({ label = 'Reset' }: Readonly<CropperResetProps>) {
  const { src, transform, reset } = useCropperPart('Reset');
  const untouched =
    transform.zoom === CROP_IDENTITY.zoom &&
    transform.x === 0 &&
    transform.y === 0 &&
    transform.rotation === 0;
  return <Tool icon="restore" label={label} disabled={src === null || untouched} onPress={reset} />;
}

export type { CropperResetProps, CropperRotateProps, CropperZoomProps };
export { Reset, Rotate, Zoom };
