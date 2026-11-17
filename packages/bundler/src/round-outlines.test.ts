// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { OutlineBox } from './outline-ring';
import { roundOutlines } from './round-outlines';

const BOX: OutlineBox = {
  outlineStyle: 'solid',
  outlineWidth: 4,
  outlineOffset: 6,
  outlineColor: 'rgb(244, 182, 66)',
  cornerRadii: ['0px', '0px', '0px', '0px'],
  borderWidths: [0, 0, 0, 0],
  hostsPseudo: true,
};

const RADII: Record<string, string> = { pill: '22px', card: '13px' };

function readStub(element: Element): OutlineBox {
  const named = Object.entries(RADII).find(([name]) => element.classList.contains(name));
  const inline = element instanceof HTMLElement ? element.style.borderRadius : '';
  const corner = inline || (named?.[1] ?? '0px');
  return { ...BOX, cornerRadii: [corner, corner, corner, corner] };
}

const undo: Array<() => void> = [];

function install(): () => void {
  const sheet = document.createElement('style');
  sheet.textContent = '.ring{outline-style:solid}.flat{outline-style:none}';
  document.head.appendChild(sheet);
  const dispose = roundOutlines(document, readStub);
  undo.push(() => sheet.remove(), dispose);
  return dispose;
}

function control(classes: string): HTMLElement {
  const element = document.createElement('div');
  element.className = classes;
  document.body.appendChild(element);
  undo.push(() => element.remove());
  return element;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function ringRule(element: Element): string {
  const key = element.getAttribute('data-kroma-ring');
  const rules = Array.from(document.styleSheets).flatMap((s) => Array.from(s.cssRules));
  return (
    rules.find((r) => r.cssText.includes(`"${key}"`) && r.cssText.includes('after'))?.cssText ?? ''
  );
}

afterEach(() => {
  undo
    .splice(0)
    .reverse()
    .forEach((step) => step());
});

describe('roundOutlines', () => {
  it('redraws a rounded control outline as a ring that follows its corners', async () => {
    const pill = control('ring pill');

    install();
    await flush();

    expect(ringRule(pill)).toContain('border-top-left-radius: 32px');
  });

  it('rings a control that mounts already wearing an outline', async () => {
    install();

    const pill = control('ring pill');
    await flush();

    expect(ringRule(pill)).toContain('border-top-left-radius: 32px');
  });

  it('drops the ring when the control stops wearing an outline', async () => {
    const pill = control('ring pill');
    install();
    await flush();

    pill.className = 'flat pill';
    await flush();

    expect(pill.hasAttribute('data-kroma-ring')).toBe(false);
  });

  it('reads the corners again when the control changes classes', async () => {
    const pill = control('ring pill');
    install();
    await flush();

    pill.className = 'ring card';
    await flush();

    expect(ringRule(pill)).toContain('border-top-left-radius: 23px');
  });

  it('reads the corners again when the control inline style changes', async () => {
    const pill = control('ring pill');
    install();
    await flush();

    pill.style.borderRadius = '40px';
    await flush();

    expect(ringRule(pill)).toContain('border-top-left-radius: 50px');
  });

  it('leaves a square control to the outline the engine draws', async () => {
    const square = control('ring');

    install();
    await flush();

    expect(square.hasAttribute('data-kroma-ring')).toBe(false);
  });

  it('takes every ring away when undone', async () => {
    const pill = control('ring pill');
    const dispose = install();
    await flush();

    dispose();

    expect(pill.hasAttribute('data-kroma-ring')).toBe(false);
    expect(ringRule(pill)).toBe('');
  });
});
