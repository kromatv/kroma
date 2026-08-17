// Entry for the DEEP legacy bundle (Chromium 47, Tizen 3.0): polyfills first,
// then the same app as the modern entry. dist/index.html picks the bundle at
// runtime.
import '@kroma/bundler/polyfills-legacy';
import './main';
