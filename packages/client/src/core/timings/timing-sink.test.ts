import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTimingSink, type SendResult, type TimingSample } from './timing-sink';

const sample: TimingSample = { kind: 'api', name: 'GET /api/home', ms: 40, serverMs: 31 };

function recorder(answer: SendResult = 'sent') {
  const batches: TimingSample[][] = [];
  const send = vi.fn(async (samples: TimingSample[]) => {
    batches.push(samples);
    return answer;
  });
  return { batches, send };
}

describe('createTimingSink', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a full batch at once', async () => {
    const { batches, send } = recorder();
    const sink = createTimingSink({ send, batch: 2 });

    sink.add(sample);
    sink.add(sample);
    await Promise.resolve();

    expect(batches).toEqual([[sample, sample]]);
  });

  it('sends a lone sample once the delay is over', async () => {
    vi.useFakeTimers();
    const { batches, send } = recorder();
    const sink = createTimingSink({ send, delayMs: 1000 });

    sink.add(sample);
    await vi.advanceTimersByTimeAsync(1000);

    expect(batches).toEqual([[sample]]);
  });

  it('stops for good once the server refuses the reports', async () => {
    const { send } = recorder('refused');
    const sink = createTimingSink({ send, batch: 1 });

    sink.add(sample);
    await sink.flush();
    sink.add(sample);
    await sink.flush();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps going after a send that failed', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('sent');
    const sink = createTimingSink({ send, batch: 1 });

    sink.add(sample);
    await sink.flush();
    sink.add(sample);
    await sink.flush();

    expect(send).toHaveBeenCalledTimes(2);
  });
});
