import { describe, expect, it } from 'vitest';
import { triageSystem, triageTask } from './triage-model';

describe('triageSystem', () => {
  it('carries the guide, each label with its description, and where each area lives', () => {
    const labels = [
      { name: 'area/sdk', description: 'module-sdk, module-tools, bundler' },
      { name: 'blocked', description: '' },
    ];

    const system = triageSystem('# Tickets\n\nExactly one type.', labels);

    expect(system).toContain('<guide>\n# Tickets\n\nExactly one type.\n</guide>');
    expect(system).toContain('- area/sdk: module-sdk, module-tools, bundler\n- blocked\n');
    expect(system).toContain('- area/mobile: clients/{mobile,expo-build}/**');
  });
});

describe('triageTask', () => {
  it('wraps the issue with the labels it already carries', () => {
    const task = triageTask({ number: 7, title: 'x', body: 'y', labels: ['type/bug'] });

    expect(task).toBe(
      '<issue number="7">\n<title>\nx\n</title>\n<labels>\ntype/bug\n</labels>\n<body>\ny\n</body>\n</issue>',
    );
  });

  it('says so when the issue has no labels or no body', () => {
    const task = triageTask({ number: 7, title: 'x', body: '', labels: [] });

    expect(task).toContain('<labels>\nnone\n</labels>');
    expect(task).toContain('<body>\n(empty)\n</body>');
  });
});
