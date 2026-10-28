import { describe, expect, it } from 'vitest';
import {
  type Axes,
  additions,
  areasOfForm,
  areasOfPaths,
  isTriaged,
  typeOfTitle,
} from './triage-labels';

const axes: Axes = {
  type: ['type/bug', 'type/feature', 'type/question'],
  priority: ['priority/p1', 'priority/p2', 'priority/p3'],
  area: ['area/server', 'area/mobile', 'area/tv', 'area/ci', 'area/docs'],
};

describe('areasOfPaths', () => {
  it('names every area a changed file reaches, once each', () => {
    const paths = ['server/src/main.rs', 'clients/tizen/src/app.tsx', 'packages/tv/src/a.ts'];

    expect(areasOfPaths(paths)).toEqual(['area/server', 'area/tv']);
  });

  it('counts a root markdown file as docs but not one inside a package', () => {
    expect(areasOfPaths(['README.md'])).toEqual(['area/docs']);
    expect(areasOfPaths(['packages/client/README.md'])).toEqual([]);
  });

  it('puts the workflows and the pipeline CLI under ci', () => {
    expect(areasOfPaths(['.github/workflows/triage.yml', 'packages/ci-tools/src/cli.ts'])).toEqual([
      'area/ci',
    ]);
  });
});

describe('areasOfForm', () => {
  it('reads the single choice of the bug form', () => {
    const body = '### Surface\n\nSynology package\n\n### Version\n\n0.4.2\n';

    expect(areasOfForm(body)).toEqual(['area/synology']);
  });

  it('reads every choice of a multiple-choice answer, in the order the areas are listed', () => {
    const body = '### Surfaces affected\n\nServer (Rust), TV clients, Mobile, SDK / tooling\n';

    expect(areasOfForm(body)).toEqual(['area/server', 'area/sdk', 'area/tv', 'area/mobile']);
  });

  it('ignores a choice that only appears under a later heading', () => {
    const body = '### Surface\n\nWeb client\n\n### Steps to reproduce\n\nOpen the Desktop app\n';

    expect(areasOfForm(body)).toEqual(['area/web']);
  });

  it('finds nothing in a body that is not a form', () => {
    expect(areasOfForm('## Problem\n\nThe server crashes.')).toEqual([]);
  });
});

describe('typeOfTitle', () => {
  it('maps a conventional-commit type onto the type axis', () => {
    expect(typeOfTitle('fix(tv): the player starts')).toBe('type/bug');
    expect(typeOfTitle('feat!: a breaking feature')).toBe('type/feature');
    expect(typeOfTitle('ci(npm): trusted publishing')).toBe('type/chore');
  });

  it('proposes nothing for a title that is not a conventional commit', () => {
    expect(typeOfTitle('Support for folders which have symlinks')).toBeUndefined();
    expect(typeOfTitle('revert: an earlier change')).toBeUndefined();
  });
});

describe('additions', () => {
  it('fills every empty axis', () => {
    const proposal = { type: 'type/bug', priority: 'priority/p2', areas: ['area/mobile'] };

    expect(additions([], proposal, axes)).toEqual(['type/bug', 'priority/p2', 'area/mobile']);
  });

  it('never replaces a label a person already set on an axis', () => {
    const proposal = { type: 'type/feature', priority: 'priority/p3', areas: ['area/server'] };

    expect(additions(['type/bug', 'area/tv'], proposal, axes)).toEqual(['priority/p3']);
  });

  it('drops a name the repository does not define', () => {
    const proposal = { type: 'type/wish', areas: ['area/mars', 'area/ci'] };

    expect(additions([], proposal, axes)).toEqual(['area/ci']);
  });

  it('leaves the flow and automation labels alone', () => {
    const proposal = { type: 'type/bug', areas: [] };

    expect(additions(['needs-info', 'dependencies'], proposal, axes)).toEqual(['type/bug']);
  });
});

describe('isTriaged', () => {
  it('is true only once all three axes carry a label', () => {
    expect(isTriaged(['type/bug', 'priority/p1', 'area/server'])).toBe(true);
    expect(isTriaged(['type/bug', 'area/server'])).toBe(false);
  });
});
