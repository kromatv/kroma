import { Column } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { Download } from '#site/lib/artifacts';
import { mb } from '#site/lib/ui';

export interface ModuleDownloadProps {
  file: Download;
}

/** The module's `.kmod`, the one bundle every platform installs, and its size. */
export function ModuleDownload({ file }: Readonly<ModuleDownloadProps>) {
  const size = mb(file.size);
  return (
    <Column gap={6} align="flex-end" shrink={0}>
      <Button
        variant="primary"
        size="sm"
        icon="download"
        label="Download"
        href={file.url}
        role="link"
      />
      {size ? (
        <Text color="textDim" variant="meta" lines={1}>
          {size}
        </Text>
      ) : null}
    </Column>
  );
}
