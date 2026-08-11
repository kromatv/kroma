import { useState } from 'react';
import { ChannelBadge } from '#site/components/channel-badge';
import { NotesAction } from '#site/components/notes-action';
import type { Release } from '#site/lib/release';
import { shortHash } from '#site/lib/ui';
import { Box, Row } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Icon } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { CopyButton } from '#ui/components/molecules/copy-button';
import { Tooltip } from '#ui/components/molecules/tooltip';

export interface ReleaseRowProps {
  release: Release;
  current?: boolean;
}

export function ReleaseRow({ release, current = false }: Readonly<ReleaseRowProps>) {
  const [hovered, setHovered] = useState(false);

  return (
    <Row
      gap={16}
      px={18}
      py={12}
      between
      wrap
      bg={hovered ? 'surface2' : 'transparent'}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Row gap={10} minW={0} grow={1} basis={200}>
        <Box grow={1} minW={0}>
          <Txt variant="label" font="mono" lines={1}>
            {release.version}
          </Txt>
        </Box>
        <ChannelBadge channel={release.channel} current={current} />
      </Row>
      <Row gap={16} shrink={1} minW={0} wrap>
        {release.md5 ? <Checksum md5={release.md5} /> : null}
        <Box minW={92}>
          <Txt variant="meta" color="textDim" font="mono" lines={1}>
            {release.day}
          </Txt>
        </Box>
        <Box minW={76} align="flex-end">
          <Txt variant="meta" color="textDim" font="mono" lines={1}>
            {release.size}
          </Txt>
        </Box>
        <Row gap={8} shrink={0}>
          <NotesAction release={release} />
          <Button variant="primary" size="sm" icon="download" href={release.spk} label=".spk" />
        </Row>
      </Row>
    </Row>
  );
}

function Checksum({ md5 }: Readonly<{ md5: string }>) {
  return (
    <Row gap={6} shrink={1} minW={0}>
      <Icon name="fingerprint" size={14} color="textDim" />
      <Tooltip label={md5}>
        <Box shrink={1} minW={0}>
          <Txt color="textDim" variant="meta" font="mono" lines={1}>
            MD5 {shortHash(md5)}
          </Txt>
        </Box>
      </Tooltip>
      <Box shrink={0}>
        <CopyButton value={md5} variant="ghost" label="Copy hash" copiedLabel="Copied" />
      </Box>
    </Row>
  );
}
