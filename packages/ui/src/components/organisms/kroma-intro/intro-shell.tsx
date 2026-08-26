import type { ReactNode } from 'react';
import { KEYFRAMES } from './animations';

export interface IntroShellProps {
  exiting: boolean;
  children: ReactNode;
}

/**
 * The full-screen frame both intros render into. Framework-free (plain inline
 * styles) so it renders identically on the web SSR shell and on old TV webviews.
 */
export function IntroShell({ exiting, children }: Readonly<IntroShellProps>) {
  return (
    <div
      className="kroma-intro"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        overflow: 'hidden',
        background: '#0A0A0C',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
      }}
      role="img"
      aria-label="KROMA"
    >
      <style>{KEYFRAMES}</style>

      {children}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#0A0A0C',
          opacity: exiting ? 1 : 0,
          transition: 'opacity .8s ease',
          pointerEvents: 'none',
          zIndex: 50,
        }}
      />
    </div>
  );
}
