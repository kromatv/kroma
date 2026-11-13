import { FlowId, FlowResult, ProviderId } from '@kromatv/client/sso';
import { z } from 'zod';

const PENDING_KEY = 'kroma.sso.flow';
const OUTCOME_KEY = 'kroma.sso.outcome';

export const FlowPurpose = z.enum(['signIn', 'link', 'test']);
export type FlowPurpose = z.infer<typeof FlowPurpose>;

const PendingFlow = z.object({
  flowId: FlowId,
  secret: z.string(),
  purpose: FlowPurpose,
  provider: ProviderId,
  returnTo: z.string(),
});
export type PendingFlow = z.infer<typeof PendingFlow>;

const FlowOutcome = z.object({
  purpose: FlowPurpose,
  provider: ProviderId,
  result: FlowResult,
});
export type FlowOutcome = z.infer<typeof FlowOutcome>;

function read<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return null;
    const parsed = schema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function remove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

/** Keeps the half of a flow that never leaves this tab, for the page the
 * provider sends the person back to. */
export function rememberFlow(flow: PendingFlow): void {
  write(PENDING_KEY, flow);
}

/** The flow this tab began under `flowId`, or `null` when it began none: the
 * address was opened in another tab or another browser. */
export function pendingFlow(flowId: string): PendingFlow | null {
  const flow = read(PENDING_KEY, PendingFlow);
  return flow?.flowId === flowId ? flow : null;
}

export function forgetFlow(): void {
  remove(PENDING_KEY);
}

/** Hands a flow's result to the page that began it. */
export function leaveOutcome(outcome: FlowOutcome): void {
  write(OUTCOME_KEY, outcome);
}

/** Reads the result a flow of `purpose` left, once. */
export function takeOutcome(purpose: FlowPurpose): FlowOutcome | null {
  const outcome = read(OUTCOME_KEY, FlowOutcome);
  if (outcome?.purpose !== purpose) return null;
  remove(OUTCOME_KEY);
  return outcome;
}
