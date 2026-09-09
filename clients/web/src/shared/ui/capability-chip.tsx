import { capabilities, type HdrCapabilities, type PlaybackCapabilities } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Badge, Row, Tooltip } from '@kromatv/ui/kit';
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
      <Row gap={6}>
        {caps?.hevc ? <Badge tone="H.265">H.265 OK</Badge> : <Badge tone="neutral">H.265 ✕</Badge>}
        {hdrLabels(caps).map((label) => (
          <Badge key={label} tone="HDR">
            {label}
          </Badge>
        ))}
        {caps?.av1 ? <Badge tone="info">AV1</Badge> : null}
      </Row>
    </Tooltip>
  );
}

// Brand names, so they are not translated; HDR10+ sits beside HDR10 rather than
// replacing it, because a device can draw the base layer and not the metadata.
const HDR_LABELS: ReadonlyArray<readonly [keyof HdrCapabilities, string]> = [
  ['hdr10', 'HDR10'],
  ['hdr10Plus', 'HDR10+'],
  ['dolbyVision', 'Dolby Vision'],
  ['hlg', 'HLG'],
] as const;

function hdrLabels(caps: PlaybackCapabilities | null): string[] {
  if (!caps) return [];
  return HDR_LABELS.filter(([key]) => caps.hdr[key]).map(([, label]) => label);
}
