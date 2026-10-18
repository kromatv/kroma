import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineRule } from './define-rule.mjs';
import plugin from './index.mjs';

const rule = plugin.rules['no-relative-workspace-imports'];
describe('agent guidance contract', () => {
  for (const field of ['description', 'why', 'scope', 'repair', 'exceptions', 'verification']) {
    it(`rejects missing ${field}`, () => {
      assert.throws(() => defineRule('example', { ...rule.guidance, [field]: '' }, rule));
    });
  }
  for (const kind of ['valid', 'invalid']) {
    it(`requires ${kind} examples`, () => {
      assert.throws(() => defineRule('example', { ...rule.guidance, [kind]: [] }, rule));
    });
  }
  it('exposes the same description to tooling and agents', () => {
    assert.equal(rule.meta.docs.description, rule.guidance.description);
    assert.equal(rule.guidance.id, 'kroma/no-relative-workspace-imports');
  });
  it('rejects unfinished draft guidance', () => {
    assert.throws(() =>
      defineRule('example', { ...rule.guidance, why: 'TODO: Explain why.' }, rule),
    );
  });
  it('allows guidance to describe task markers without treating it as a draft', () => {
    assert.doesNotThrow(() =>
      defineRule('example', { ...rule.guidance, why: 'TODO comments need a real owner.' }, rule),
    );
  });
  it('assigns the rule id from its registered name', () => {
    assert.equal(defineRule('example', rule.guidance, rule).guidance.id, 'kroma/example');
  });
  it('rejects missing visitors and diagnostics', () => {
    assert.throws(() => defineRule('example', rule.guidance, {}));
  });
  it('rejects invalid names', () => {
    assert.throws(() => defineRule('../escape', rule.guidance, rule));
  });
});
