// From a declaration the evaluator produced to the compiled leaf the build
// writes in its place: the engine's own resolver turns the vocabulary into
// longhands, the compiler turns those into classes.

import { breakpointBits } from '../../src/core/breakpoint-cascade.ts';
import { type Split, split } from '../../src/core/normalize.ts';
import { type CompiledRule, rulesOf } from './compile.ts';
import { Unstatic } from './module-scope.ts';
import { compileSteps, STEPS, type StepLayer } from './steps.ts';

export interface CompiledLeaf {
  readonly values: Readonly<Record<string, unknown>>;
  readonly states?: Readonly<Record<string, Record<string, unknown>>>;
  readonly rules: readonly CompiledRule[];
}

function checkSerializable(value: unknown, at: string): void {
  if (value === null || value === undefined) return;
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return;
    case 'object':
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        checkSerializable(inner, `${at}.${key}`);
      }
      return;
    default:
      throw new Unstatic(`a ${typeof value} at ${at}`);
  }
}

function layer(perStep: readonly Record<string, unknown>[], at: string): StepLayer {
  for (const longhands of perStep) {
    for (const [key, value] of Object.entries(longhands)) {
      if (breakpointBits(value) !== 0) throw new Unstatic(`a ${key} stated per breakpoint`);
    }
    checkSerializable(longhands, at);
  }
  const { values, rules } = compileSteps(perStep);
  return { values, rules: [...rules, ...rulesOf(values)] };
}

/**
 * Compiles one declaration, or throws {@link Unstatic} for one only the
 * runtime can resolve.
 */
export function compileDeclaration(decl: Record<string, unknown>): CompiledLeaf {
  const piece = split(decl, 0);
  if (!piece) throw new Unstatic('an empty declaration');
  const perStep = piece.breakpoints === 0 ? [piece] : STEPS.map((at) => split(decl, at) as Split);
  const rest = layer(
    perStep.map((step) => step.rest),
    'rest',
  );
  const rules = [...rest.rules];
  const states: Record<string, Record<string, unknown>> = {};
  for (const name of piece.declared) {
    const coat = layer(
      perStep.map((step) => step.states[name] ?? {}),
      `_${name}`,
    );
    rules.push(...coat.rules);
    states[name] = coat.values;
  }
  return { values: rest.values, states: piece.declared.length > 0 ? states : undefined, rules };
}
