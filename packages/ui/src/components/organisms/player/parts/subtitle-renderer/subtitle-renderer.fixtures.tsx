import type { PlayerSub } from '#ui/components/organisms/player/types';

export // The renderer fetches the track's url itself, and a `data:` url is a url, so the
// workbench gets actual cues instead of an empty caption area.
const CUES = `WEBVTT

00:00:00.000 --> 00:00:20.000
I've seen things you people wouldn't believe.

00:00:20.000 --> 00:00:40.000
Attack ships on fire off the shoulder of Orion.

00:00:40.000 --> 00:01:00.000
All those moments will be lost in time,
like tears in rain.
`;

export const VTT = `data:text/vtt,${encodeURIComponent(CUES)}`;

export const TRACK: PlayerSub[] = [
  { index: 0, language: 'eng', label: 'English', codec: 'webvtt', url: VTT, selectable: true },
];

export // The sample stills are cinematic and dark; this lifts one into the range a snow /
// daylight scene sits in.
const BRIGHT = { opacity: 0.95, filter: 'brightness(2.4) saturate(0.9)' } as const;
