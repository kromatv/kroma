import { BREAKPOINT_ATTRIBUTE, LAST_BREAKPOINT } from '../../src/core/breakpoint-cascade.ts';
import { BREAKPOINTS } from '../../src/core/tokens/layout.ts';
import { type Carrier, type CompiledRule, carrierOf, cssValue, hashOf } from './compile.ts';
import { Unstatic } from './module-scope.ts';

const STEP_GROUP = 4;

interface Step {
  readonly at: number;
  readonly value: string | number;
}

export interface StepLayer {
  readonly values: Record<string, unknown>;
  readonly rules: readonly CompiledRule[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function stated(value: unknown, property: string): string | number {
  if (typeof value === 'string' || typeof value === 'number') return value;
  throw new Unstatic(`a ${property} stated per breakpoint as ${typeof value}`);
}

function stepsOf(perStep: readonly Record<string, unknown>[], property: string): Step[] {
  const steps: Step[] = [{ at: 0, value: stated(perStep[0]?.[property], property) }];
  for (let at = 1; at < perStep.length; at++) {
    const layer = perStep[at] as Record<string, unknown>;
    if (!(property in layer)) {
      throw new Unstatic(`a ${property} stated at some breakpoints and not others`);
    }
    if (same(layer[property], steps.at(-1)?.value)) continue;
    steps.push({ at, value: stated(layer[property], property) });
  }
  return steps;
}

function substitutes(
  carrier: Carrier,
  text: string,
  property: string,
  value: string | number,
): boolean {
  const literal = carrierOf(property, value);
  return (
    literal !== null && carrier.body.replaceAll(text, cssValue(property, value)) === literal.body
  );
}

function readsPerStep(property: string, steps: readonly Step[]): [string, CompiledRule[]] {
  const base = steps[0] as Step;
  const variable = `--k${hashOf(property + JSON.stringify(steps))}`;
  const text = `var(${variable},${cssValue(property, base.value)})`;
  const carrier = carrierOf(property, text);
  const rules: CompiledRule[] = [];
  for (const step of steps) {
    if (!carrier || !substitutes(carrier, text, property, step.value)) {
      throw new Unstatic(`a ${property} stated per breakpoint`);
    }
    if (step.at === 0) continue;
    const value = cssValue(property, step.value);
    const reached = BREAKPOINTS[step.at] as string;
    rules.push({
      group: STEP_GROUP + step.at,
      css: `:root[${BREAKPOINT_ATTRIBUTE}~="${reached}"] .${carrier.cls}{${variable}:${value};}`,
    });
  }
  return [text, rules];
}

/**
 * Folds one layer, resolved at each breakpoint in turn, into the layer the
 * build writes. A single entry is a layer that names no breakpoint at all, and
 * passes through untouched.
 */
export function compileSteps(perStep: readonly Record<string, unknown>[]): StepLayer {
  const base = perStep[0] as Record<string, unknown>;
  if (perStep.length === 1) return { values: base, rules: [] };
  const values: Record<string, unknown> = {};
  const rules: CompiledRule[] = [];
  for (const layer of perStep) {
    for (const property of Object.keys(layer)) {
      if (property in base) continue;
      throw new Unstatic(`a ${property} stated at some breakpoints and not others`);
    }
  }
  for (const property of Object.keys(base)) {
    const steps = stepsOf(perStep, property);
    if (steps.length === 1) {
      values[property] = base[property];
      continue;
    }
    const [text, stepRules] = readsPerStep(property, steps);
    values[property] = text;
    rules.push(...stepRules);
  }
  return { values, rules };
}

export const STEPS: readonly number[] = Array.from({ length: LAST_BREAKPOINT + 1 }, (_, at) => at);
