import { describe, expect, it } from 'vitest';
import { factLabel, qualityLabel } from './fact-labels';

describe('factLabel', () => {
  it('writes a wire name the way a release name does', () => {
    expect(factLabel('R1080')).toBe('1080p');
    expect(factLabel('WebDl')).toBe('WEB-DL');
    expect(factLabel('dolbyVision')).toBe('Dolby Vision');
  });

  it('writes an audio codec the way a tracker spells it', () => {
    expect(factLabel('dtsHdMa')).toBe('DTS-HD MA');
  });

  it('leaves a name it does not know as it came', () => {
    expect(factLabel('theora')).toBe('theora');
  });
});

describe('qualityLabel', () => {
  it('writes a source and a resolution the way a release name does', () => {
    expect(qualityLabel('webdl-1080p')).toBe('WEB-DL 1080p');
    expect(qualityLabel('remux-2160p')).toBe('Remux 2160p');
    expect(qualityLabel('bluray-sd')).toBe('Blu-ray SD');
  });

  it('writes a source that carries its own resolution once', () => {
    expect(qualityLabel('cam')).toBe('CAM');
    expect(qualityLabel('sdtv')).toBe('SDTV');
    expect(qualityLabel('dvd')).toBe('DVD');
  });

  it('reads an unrecognised source as the resolution alone', () => {
    expect(qualityLabel('unknown-720p')).toBe('720p');
  });

  it('has nothing to write for a quality that names neither', () => {
    expect(qualityLabel('unknown')).toBeNull();
  });
});
