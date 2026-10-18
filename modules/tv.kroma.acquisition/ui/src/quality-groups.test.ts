import { describe, expect, it } from 'vitest';
import { qualityGroups } from './quality-groups';

describe('qualityGroups', () => {
  it('gathers the qualities of one resolution under it', () => {
    const groups = qualityGroups(['webdl-1080p', 'bluray-1080p', 'webdl-720p']);

    expect(groups).toEqual([
      { label: '1080p', qualities: ['webdl-1080p', 'bluray-1080p'] },
      { label: '720p', qualities: ['webdl-720p'] },
    ]);
  });

  it('files a source that only ever existed in SD under SD', () => {
    const groups = qualityGroups(['cam', 'sdtv', 'dvd', 'bluray-sd']);

    expect(groups).toEqual([{ label: 'SD', qualities: ['cam', 'sdtv', 'dvd', 'bluray-sd'] }]);
  });

  it('keeps the order the ladder lists the resolutions in', () => {
    const groups = qualityGroups(['remux-2160p', 'webdl-720p', 'bluray-sd']);

    expect(groups.map((group) => group.label)).toEqual(['2160p', '720p', 'SD']);
  });

  it('leaves the quality that names no resolution in a group of its own', () => {
    const groups = qualityGroups(['unknown', 'webdl-720p']);

    expect(groups).toEqual([
      { label: null, qualities: ['unknown'] },
      { label: '720p', qualities: ['webdl-720p'] },
    ]);
  });

  it('answers an empty ladder with no group at all', () => {
    expect(qualityGroups([])).toEqual([]);
  });
});
