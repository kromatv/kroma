// What the torrent turns out to hold, read from its own file list.

import type { TorrentAnalysis, TorrentFileView } from '@kroma/module-acquisition/schemas';
import type { Kind } from './manual-grab-target';

/** What the contents say the grab is for. */
interface DetectedContent {
  kind: Kind;
  season: string;
  episode: string;
  seasons: number[];
  episodeCount: number;
  certain: boolean;
}

const videoFiles = (analysis: TorrentAnalysis): TorrentFileView[] =>
  analysis.files.filter((f) => f.isVideo);

const episodeFiles = (analysis: TorrentAnalysis): TorrentFileView[] =>
  videoFiles(analysis).filter((f) => f.episode !== null);

/**
 * Read an analysed torrent into the shape the add needs.
 *
 * `unknown` means no video the classifier recognised, which is not a fact worth
 * overriding a parsed name with, so it reports uncertain and the caller keeps
 * whatever the release name said.
 */
export function detect(analysis: TorrentAnalysis): DetectedContent {
  const episodes = episodeFiles(analysis);
  const first = episodes[0];
  const base = {
    seasons: analysis.seasons,
    episodeCount: episodes.length,
    certain: analysis.kind !== 'unknown',
  };
  switch (analysis.kind) {
    case 'episode':
      return {
        ...base,
        kind: 'episode',
        season: first?.season != null ? String(first.season) : '',
        episode: first?.episode != null ? String(first.episode) : '',
      };
    case 'season':
    case 'series':
      return {
        ...base,
        kind: 'season',
        season: analysis.seasons.length === 1 ? String(analysis.seasons[0]) : '',
        episode: '',
      };
    case 'movie':
      return { ...base, kind: 'movie', season: '', episode: '' };
    default:
      return { ...base, kind: 'movie', season: '', episode: '' };
  }
}

/** The one-line summary of what was found, as message-key arguments. */
