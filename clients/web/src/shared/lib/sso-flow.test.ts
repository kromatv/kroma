// @vitest-environment jsdom
import { FlowId, ProviderId } from '@kromatv/client/sso';
import { afterEach, describe, expect, it } from 'vitest';
import {
  forgetFlow,
  leaveOutcome,
  pendingFlow,
  rememberFlow,
  takeOutcome,
} from '#web/shared/lib/sso-flow';

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
    rememberFlow(flow);

    expect(pendingFlow('f1')).toEqual(flow);
  });

  it('is not found under another id, so a link opened elsewhere collects nothing', () => {
    rememberFlow(flow);

    expect(pendingFlow('f2')).toBeNull();
  });

  it('is gone once forgotten', () => {
    rememberFlow(flow);

    forgetFlow();

    expect(pendingFlow('f1')).toBeNull();
  });

  it('reads as none when what is stored is not a flow', () => {
    window.sessionStorage.setItem('kroma.sso.flow', '{"flowId":"f1"}');
    expect(pendingFlow('f1')).toBeNull();

    window.sessionStorage.setItem('kroma.sso.flow', 'not json');
    expect(pendingFlow('f1')).toBeNull();
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
