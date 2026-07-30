import handler from '@tanstack/react-start/server-entry';
import { paraglideMiddleware } from '#site/paraglide/server';

// Every render — including each page the build prerenders — goes through
// Paraglide's middleware first. It reads the locale off the request URL (the only
// strategy this site enables, see vite.config) and puts it in async storage for
// the duration of the render, which is what makes `m.foo()` return French inside
// /fr/* and English at the root without a single component taking a locale prop.
//
// This file is the reason the prerender is locale-correct: without it every
// prerendered page would render in the base locale and /fr/* would ship English
// HTML that only switched to French after hydration.
export default {
  fetch(request: Request): Promise<Response> {
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
};
