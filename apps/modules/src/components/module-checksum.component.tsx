import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { CopyButton } from '@kromatv/ui/kit/molecules/copy-button';
import { shortHash } from '#site/lib/ui';

export interface ModuleChecksumProps {
  sha256: string;
}

/** The digest the server verifies a bundle by, shortened, with a copy of it whole. */
export function ModuleChecksum({ sha256 }: Readonly<ModuleChecksumProps>) {
  return (
    <Row gap={8} shrink={1} minW={0}>
      <Icon name="fingerprint" size={14} color="textDim" />
      <Box shrink={1} minW={0}>
        <Text color="textDim" variant="meta" font="mono" lines={1}>
          sha256 {shortHash(sha256)}
        </Text>
      </Box>
      <Box shrink={0}>
        <CopyButton value={sha256} label="Copy hash" iconOnly />
      </Box>
    </Row>
  );
}
