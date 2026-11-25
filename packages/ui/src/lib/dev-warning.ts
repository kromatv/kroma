declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * Tells a developer about a misuse the kit survives but draws wrong, and says
 * nothing in a production build. `process.env.NODE_ENV` is the one signal
 * every target sets: Vite and Metro inline it, vitest runs as `test`, and the
 * published build defines it as `production`.
 */
function warnInDevelopment(message: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(message);
  }
}

export { warnInDevelopment };
