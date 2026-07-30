import handler from '@tanstack/react-start/server-entry';
import { paraglideMiddleware } from '#site/paraglide/server';

// Every render, including each page the build prerenders, goes through
// Paraglide's middleware first: it reads the locale off the request URL and
// puts it in async storage for the render, which is what makes `m.foo()`
// return French inside /fr/* without any component taking a locale prop.
// Without this, every prerendered page would ship English HTML that only
// switched to French after hydration.
export default {
  fetch(request: Request): Promise<Response> {
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
};
