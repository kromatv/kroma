// @vitest-environment jsdom
import { FlowId, ProviderId } from '@kromatv/client/sso';
import { afterEach, describe, expect, it } from 'vitest';
import { leaveOutcome, tabFlowStore, takeOutcome } from '#web/shared/lib/sso-flow';

const flow = {
  flowId: FlowId.parse('f1'),
  secret: 's3cret',
  purpose: 'signIn' as const,
  provider: ProviderId.parse('p0'),
  returnTo: '/movies',
};

afterEach(() => {
  window.sessionStorage.clear();
});

describe('the flow a tab began', () => {
  it('is found again under its own id', () => {
    tabFlowStore.save(flow);

    expect(tabFlowStore.load('f1')).toEqual(flow);
  });

  it('is not found under another id, so a link opened elsewhere collects nothing', () => {
    tabFlowStore.save(flow);

    expect(tabFlowStore.load('f2')).toBeNull();
  });

  it('is gone once forgotten', () => {
    tabFlowStore.save(flow);

    tabFlowStore.clear();

    expect(tabFlowStore.load('f1')).toBeNull();
  });

  it('reads as none when what is stored is not a flow', () => {
    window.sessionStorage.setItem('kroma.sso.flow', '{"flowId":"f1"}');
    expect(tabFlowStore.load('f1')).toBeNull();

    window.sessionStorage.setItem('kroma.sso.flow', 'not json');
    expect(tabFlowStore.load('f1')).toBeNull();
  });
});

describe('the result a flow left', () => {
  const outcome = {
    purpose: 'test' as const,
    provider: ProviderId.parse('p0'),
    result: { status: 'failed' as const, reason: 'token.audience' },
  };

  it('is read once by the page it was left for', () => {
    leaveOutcome(outcome);

    expect(takeOutcome('test')).toEqual(outcome);
    expect(takeOutcome('test')).toBeNull();
  });

  it('stays put for a page with another purpose', () => {
    leaveOutcome(outcome);

    expect(takeOutcome('link')).toBeNull();
    expect(takeOutcome('test')).toEqual(outcome);
  });
});
