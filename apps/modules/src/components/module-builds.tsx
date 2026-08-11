import type { Download } from '#site/lib/artifacts';
import { mb, platformLabel, shortHash } from '#site/lib/ui';
import { Box, Column, Row } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Divider } from '#ui/components/atoms/divider';
import { Icon } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { CopyButton } from '#ui/components/molecules/copy-button';

export interface ModuleBuildsProps {
  files: Download[];
}

/** Every `.kmod` this version ships, with the digest the server verifies. */
export function ModuleBuilds({ files }: Readonly<ModuleBuildsProps>) {
  if (files.length === 0) return null;
  return (
    <Column gap={12}>
      <Txt variant="overline" color="accentText">
        Builds
      </Txt>
      <Box bg="surface1" border="border" radius="xl" overflow="hidden">
        {files.map((file, at) => (
          <Column key={file.url}>
            {at > 0 ? <Divider /> : null}
            <Row gap={16} px={18} py={14} wrap align="center">
              <Box shrink={0} basis={140}>
                <Txt variant="label">{platformLabel(file.target)}</Txt>
              </Box>
              <Box shrink={0} basis={70}>
                <Txt color="textDim" variant="meta">
                  {mb(file.size)}
                </Txt>
              </Box>
              {file.sha256 ? (
                <Row gap={8} grow={1} shrink={1} basis={220} minW={0}>
                  <Icon name="fingerprint" size={14} color="textDim" />
                  <Box shrink={1} minW={0}>
                    <Txt color="textDim" variant="meta" font="mono" lines={1}>
                      {shortHash(file.sha256)}
                    </Txt>
                  </Box>
                  <Box shrink={0}>
                    <CopyButton value={file.sha256} label="Copy hash" iconOnly />
                  </Box>
                </Row>
              ) : null}
              <Box shrink={0}>
                <Button
                  variant="glass"
                  size="sm"
                  icon="download"
                  label="Download"
                  href={file.url}
                  role="link"
                />
              </Box>
            </Row>
          </Column>
        ))}
      </Box>
    </Column>
  );
}
