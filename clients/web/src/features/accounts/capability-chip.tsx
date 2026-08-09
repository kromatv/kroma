import { capabilities, type PlaybackCapabilities } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Badge, Tooltip } from '@kroma/ui/kit';
import { useEffect, useState } from 'react';

/** Readout of what this device can direct-play, with a tooltip showing the
 * detection method. Detection touches the DOM → client-only (neutral on the
 * server, filled in after mount to avoid a hydration mismatch). */
export function CapabilityChip() {
  const t = useT();
  const [caps, setCaps] = useState<PlaybackCapabilities | null>(null);
  useEffect(() => {
    setCaps(capabilities());
  }, []);

  return (
    <Tooltip label={caps ? t('common.detection', { source: caps.source }) : t('common.detecting')}>
      <span className="inline-flex cursor-default items-center gap-1.5">
        {caps?.hevc ? <Badge tone="H.265">H.265 OK</Badge> : <Badge tone="neutral">H.265 ✕</Badge>}
        {caps?.hdr ? <Badge tone="HDR">HDR</Badge> : null}
        {caps?.av1 ? <Badge tone="info">AV1</Badge> : null}
      </span>
    </Tooltip>
  );
}
