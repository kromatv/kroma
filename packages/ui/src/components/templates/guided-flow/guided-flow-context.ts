import type { ControlSize } from '#ui/lib/field-shell';
import { partContext } from '#ui/lib/part-context';

interface GuidedFlowState {
  size: ControlSize;
  pad: number;
}

const [GuidedFlowContext, useGuidedFlowPart] = partContext<GuidedFlowState>('GuidedFlow.Root');

const PAD = { narrow: 20, roomy: 36 } as const;

export type { GuidedFlowState };
export { GuidedFlowContext, PAD, useGuidedFlowPart };
