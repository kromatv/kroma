import { describe, expect, it } from 'vitest';
import { type Runtime, runtimeLabel } from './television';

const reported: Runtime = {
  name: 'Android',
  version: '12',
  engine: { name: 'WebView', version: '108' },
  learned: 'reported',
};

const derived: Runtime = {
  name: 'Tizen',
  version: '8.0',
  engine: { name: 'Chromium', version: '108' },
  learned: 'derived',
};

describe('runtimeLabel', () => {
  it('states a version read off the set as it stands', () => {
    expect(runtimeLabel(reported)).toBe('Android 12, WebView 108');
  });

  it('says of a version worked out from the model that it was', () => {
    expect(runtimeLabel(derived)).toBe('Tizen 8.0, Chromium 108, by model');
  });

  it('names the platform alone when no engine goes with it', () => {
    expect(runtimeLabel({ ...derived, name: 'Android', version: '9', engine: null })).toBe(
      'Android 9, by model',
    );
  });

  it('names an engine that carries no version of its own', () => {
    const tvos: Runtime = {
      name: 'tvOS',
      version: '27.0',
      engine: { name: 'React Native', version: null },
      learned: 'reported',
    };

    expect(runtimeLabel(tvos)).toBe('tvOS 27.0, React Native');
  });

  it('says nothing at all for a set nothing dated', () => {
    expect(runtimeLabel(null)).toBe('');
  });
});
