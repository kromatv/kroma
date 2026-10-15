// @vitest-environment jsdom
import type { CapabilitySource } from '@kromatv/client/capabilities';
import type { WatchableProgress } from '@kromatv/client/watchable';
import type { WatchStage } from '@kromatv/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleArrival, sampleSource } from '#ui/lib/sample-arrival';
import { declared, onScreen } from '#ui/testing';
import { Preparation } from './preparation';
import { SOURCES, STAGES } from './preparation.fixtures';

afterEach(cleanup);

const SEARCHING: WatchStage = { stage: 'searching', release: null, downloadId: null };

interface Shown {
  stage?: WatchStage;
  progress?: WatchableProgress | null;
  source?: CapabilitySource | null;
  sources?: readonly CapabilitySource[];
}

function screenAt({ stage = SEARCHING, progress = null, source = null, sources = [] }: Shown = {}) {
  const onBack = vi.fn();
  const onCancel = vi.fn();
  const onSourceChange = vi.fn();
  render(
    onScreen(
      <Preparation
        stage={stage}
        progress={progress}
        source={source}
        sources={sources}
        onSourceChange={onSourceChange}
        title="Sintel"
        art={null}
        onBack={onBack}
        onCancel={onCancel}
      />,
    ),
  );
  return { onBack, onCancel, onSourceChange };
}

function stage(name: string): WatchStage {
  const found = STAGES[name];
  if (!found) throw new Error(`no ${name} fixture`);
  return found;
}

function undeclared(percent: number): WatchableProgress {
  const sample = sampleArrival(percent);
  return {
    progress: sample.progress,
    figures: {},
    arriving: [],
    downBps: sample.downBps,
    upBps: sample.upBps,
    peers: sample.peers,
    peersSeen: sample.peersSeen,
    pieces: sample.pieces,
  };
}

describe('a title on its way', () => {
  it('prints the line the stage is at', () => {
    screenAt();

    expect(screen.getByText('Looking for a source…')).toBeTruthy();
  });

  it('names the release once the server has picked one', () => {
    screenAt({ stage: stage('connecting') });

    expect(screen.getByText('Release: Sintel.2010.1080p.BluRay.x264')).toBeTruthy();
  });

  it('offers a way to cancel as well as a way back', () => {
    const { onBack, onCancel } = screenAt();

    screen.getByLabelText('Back').click();
    screen.getByText('Cancel').click();

    expect(onBack).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("cancels in the source's own word for it, where it declares one", () => {
    screenAt({ source: sampleSource });

    expect(screen.getByText('Annuler')).toBeTruthy();
  });
});

describe('the figures', () => {
  it('stay away until the source has answered with any', () => {
    screenAt({ stage: stage('buffering'), source: sampleSource });

    expect(screen.queryByText('Téléchargé')).toBeNull();
  });

  it('are the ones the source declared, in its own words', () => {
    screenAt({ stage: stage('buffering'), progress: sampleArrival(34), source: sampleSource });

    expect(screen.getByText('Téléchargé')).toBeTruthy();
    expect(screen.getByText('34%')).toBeTruthy();
    expect(screen.getByText('4 / 11')).toBeTruthy();
    expect(screen.getByText('Morceaux reçus')).toBeTruthy();
  });

  it('fall back to the three a download used to report, where no source declares any', () => {
    screenAt({ stage: stage('buffering'), progress: undeclared(34) });

    expect(screen.getByText('Downloaded')).toBeTruthy();
    expect(screen.getByText('34%')).toBeTruthy();
    expect(screen.getByText('Pieces received')).toBeTruthy();
  });

  it('draw no map for a source that reports no slices', () => {
    const mapless = { ...sampleSource, map: null };

    screenAt({ stage: stage('buffering'), progress: sampleArrival(34), source: mapless });

    expect(screen.queryByText('Morceaux reçus')).toBeNull();
  });

  it('mark on the map the slices the source is fetching right now', () => {
    const progress = { ...sampleArrival(34), arriving: [60, 61] };

    screenAt({ stage: stage('buffering'), progress, source: sampleSource });

    const ringed = [...document.querySelectorAll('div')].filter(
      (node) =>
        getComputedStyle(node).width === '9px' && declared(node, 'border-top-width') === '2px',
    );
    expect(ringed).toHaveLength(2);
  });
});

describe('more than one way to watch', () => {
  it('asks which one before speaking to any of them', () => {
    const { onSourceChange } = screenAt({ sources: SOURCES });

    screen.getByText('Usenet').click();

    expect(screen.getByText('Choose how to play it')).toBeTruthy();
    expect(onSourceChange).toHaveBeenCalledWith('/api/module/tv.kroma.usenet');
  });

  it('asks nothing once a viewer has settled on one', () => {
    screenAt({ sources: SOURCES, source: sampleSource });

    expect(screen.queryByText('Choose how to play it')).toBeNull();
    expect(screen.getByText('Looking for a source…')).toBeTruthy();
  });
});

describe('a refusal', () => {
  it("says why, and carries the server's own words under it", () => {
    screenAt({ stage: stage('noSource') });

    expect(screen.getByText('No source was found for this title.')).toBeTruthy();
    expect(screen.getByText("Aucune source n'a répondu en 30 s.")).toBeTruthy();
  });

  it('blames the indexers rather than the title when none could be searched', () => {
    screenAt({ stage: stage('noIndexer') });

    expect(screen.getByText('No indexer could be searched.')).toBeTruthy();
    expect(screen.queryByText('No source was found for this title.')).toBeNull();
  });

  it('offers only a way back, since there is nothing left to cancel', () => {
    screenAt({ stage: stage('failed') });

    expect(screen.queryByText('Cancel')).toBeNull();
    expect(screen.getByText('Back')).toBeTruthy();
  });
});
