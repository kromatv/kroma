import '@kroma/tv/tv.css';
import { mountTv } from '@kroma/tv/mount';
import { warnIfMixedContent } from './mixed-content';
import { installStage } from './stage';

// The 10-foot layout is fixed-px against a 1920-wide canvas, so a browser window
// gets that canvas scaled to its width rather than the raw pixels. See ./stage.
installStage();

// A browser is a desktop input environment, not a television: `Desktop` is what
// arms the real mouse pointer and the typeable text fields (see @kroma/tv
// providers/env). Arrow keys + Enter still drive the same spatial navigator, so
// a remote-shaped browser (a TV stick, a Chromecast keyboard) works too.
mountTv({ platform: 'Desktop' });

// Served over HTTPS, this page cannot reach an http:// server at all. Say so
// before the connect screen's probes fail silently. See ./mixed-content.
warnIfMixedContent();
