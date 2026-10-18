// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createFocusServices } from './focus-services';

describe('focus service ownership', () => {
  it('dispatches a handed-over direction only within its root', () => {
    const first = createFocusServices(true);
    const second = createFocusServices(true);
    const a = vi.fn();
    const b = vi.fn();
    const stopA = first.remote.subscribe(a);
    const stopB = second.remote.subscribe(b);
    try {
      first.remote.postRemoteDirection('down');
      expect(a).toHaveBeenCalledExactlyOnceWith('down');
      expect(b).not.toHaveBeenCalled();
    } finally {
      stopA();
      stopB();
    }
  });

  it('keeps geometry and mirrored controls within their host', () => {
    const first = createFocusServices();
    const second = createFocusServices();
    const view = document.createElement('button');
    document.body.append(view);
    try {
      first.probe.noteFocus(view);
      first.mirror.mirrorFocus(view);
      expect(first.probe.seq()).toBe(1);
      expect(second.probe.seq()).toBe(0);
      expect(second.probe.box()).toBeNull();
      expect(first.mirror.isMirrored(view)).toBe(true);
      expect(second.mirror.isMirrored(view)).toBe(false);
      expect(createFocusServices().probe.box()).toBeNull();
    } finally {
      view.remove();
    }
  });

  it('keeps an unconfigured phone or browser transport silent', () => {
    const host = createFocusServices();
    const handle = vi.fn();
    const stop = host.remote.subscribe(handle);
    host.remote.postRemoteDirection('down');
    expect(handle).not.toHaveBeenCalled();
    stop();
  });
});
