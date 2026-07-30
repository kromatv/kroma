// Entry for the LEGACY bundle (Chromium < 99): polyfills first, then the same
// app as the modern entry. dist/index.html picks the bundle at runtime.
import '@kroma/bundler/polyfills-legacy';
import './main';
