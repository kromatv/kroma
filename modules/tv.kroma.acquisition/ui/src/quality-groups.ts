import { qualityResolution } from './fact-labels';
import type { QualityId } from './rules-schemas';

interface QualityGroup {
  label: string | null;
  qualities: QualityId[];
}

/** The ladder cut into one band per resolution, in the order it lists them. */
export function qualityGroups(qualities: readonly QualityId[]): QualityGroup[] {
  const groups: QualityGroup[] = [];
  for (const quality of qualities) {
    const label = qualityResolution(quality);
    const group = groups.find((one) => one.label === label);
    if (group) group.qualities.push(quality);
    else groups.push({ label, qualities: [quality] });
  }
  return groups;
}
