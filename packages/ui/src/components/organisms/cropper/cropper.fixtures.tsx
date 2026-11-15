import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { stillArt } from '#ui/lib/sample-art';
import { Cropper, type CropperRootProps } from './cropper';
import { useCropper } from './cropper-context';

const FRAME_WIDTH = 320;

function Tools() {
  return (
    <Box row align="center" gap={8}>
      <Cropper.Zoom />
      <Box flex />
      <Cropper.Rotate direction="left" label="Rotate left" />
      <Cropper.Rotate direction="right" label="Rotate right" />
      <Cropper.Reset />
    </Box>
  );
}

export function Demo(props: Readonly<Partial<CropperRootProps>>) {
  return (
    <Box w={FRAME_WIDTH} gap={12}>
      <Cropper.Root src={stillArt(1)} {...props}>
        <Cropper.Frame label="Move the picture" />
        <Tools />
      </Cropper.Root>
    </Box>
  );
}

function Readout() {
  const { transform } = useCropper();
  return (
    <Text variant="meta" color="textDim">
      {`zoom ${transform.zoom.toFixed(2)} · x ${transform.x.toFixed(2)} · y ${transform.y.toFixed(2)} · ${transform.rotation}°`}
    </Text>
  );
}

function Export() {
  const { crop } = useCropper();
  const [result, setResult] = useState<string | null>(null);
  const run = async () => {
    const blob = await crop({ width: 512, height: 512 });
    setResult(blob ? `${blob.type}, ${blob.size} bytes` : 'No canvas on this target');
  };
  return (
    <Box row align="center" gap={12}>
      <Button size="sm" label="Crop to 512" onPress={() => void run()} />
      {result ? (
        <Text variant="meta" color="textDim">
          {result}
        </Text>
      ) : null}
    </Box>
  );
}

export function Avatar() {
  return (
    <Box w={FRAME_WIDTH} gap={12}>
      <Cropper.Root src={stillArt(2)} shape="circle">
        <Cropper.Frame label="Move the photo" />
        <Tools />
        <Readout />
        <Export />
      </Cropper.Root>
    </Box>
  );
}

export function Cover() {
  return (
    <Box w={FRAME_WIDTH} gap={12}>
      <Cropper.Root src={stillArt(3)} aspect={16 / 9} maxZoom={5}>
        <Cropper.Frame label="Move the cover" />
        <Tools />
      </Cropper.Root>
    </Box>
  );
}
