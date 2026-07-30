import { Button } from '#site/components/button';
import { WheelMark } from '#site/components/wheel-mark';
import { m } from '#site/paraglide/messages';

/** The branded 404, in the reader's language. Served by the SPA fallback for any
 *  path the prerender did not emit, so it stands on its own: mark, one line, a
 *  way home. */
export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <WheelMark size={64} className="opacity-90" />
      <p className="mt-8 font-display text-6xl font-extrabold text-text">{m.notfound_code()}</p>
      <p className="mt-3 max-w-md text-lg text-muted">{m.notfound_body()}</p>
      <div className="mt-8">
        <Button to="/">{m.notfound_home()}</Button>
      </div>
    </div>
  );
}
