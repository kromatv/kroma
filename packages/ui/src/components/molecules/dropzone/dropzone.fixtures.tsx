import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import { Dropzone, type DropzoneRejection, type DropzoneRootProps } from './dropzone';

export function Demo(props: Readonly<Partial<DropzoneRootProps>>) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Box w={420} gap={10}>
      <Dropzone.Root
        label="Upload a file"
        {...props}
        onDrop={(files) => setPicked(files[0]?.name ?? null)}
      >
        <Dropzone.Icon />
        <Dropzone.Title>Drop a file here</Dropzone.Title>
        <Dropzone.Description>or click to browse</Dropzone.Description>
      </Dropzone.Root>
      {picked ? (
        <Text variant="meta" color="text/50">
          {picked}
        </Text>
      ) : null}
    </Box>
  );
}

export function OneKind() {
  return (
    <Box w={420}>
      <Dropzone.Root label="Upload a torrent" accept=".torrent">
        <Dropzone.Icon name="file-upload" />
        <Dropzone.Title>Drop a .torrent here</Dropzone.Title>
        <Dropzone.Description>Nothing else is taken</Dropzone.Description>
      </Dropzone.Root>
    </Box>
  );
}

export function Bounded() {
  const [turned, setTurned] = useState<DropzoneRejection[]>([]);
  return (
    <Box w={420} gap={10}>
      <Dropzone.Root
        label="Upload a file under 1 MB"
        maxSize={1_000_000}
        onDrop={() => setTurned([])}
        onReject={setTurned}
      >
        <Dropzone.Icon />
        <Dropzone.Title>Drop a file here</Dropzone.Title>
        <Dropzone.Description>1 MB at most</Dropzone.Description>
      </Dropzone.Root>
      {turned.length > 0 ? (
        <Text variant="meta" color="danger">
          {`${turned[0]?.file.name} is too big`}
        </Text>
      ) : null}
    </Box>
  );
}

export function Busy() {
  return (
    <Box w={420}>
      <Dropzone.Root label="Uploading" loading>
        <Dropzone.Icon />
        <Dropzone.Title>Drop a file here</Dropzone.Title>
      </Dropzone.Root>
    </Box>
  );
}
