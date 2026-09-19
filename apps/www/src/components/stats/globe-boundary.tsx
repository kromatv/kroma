import { Component, type ReactNode } from 'react';

interface GlobeBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface GlobeBoundaryState {
  failed: boolean;
}

/** A globe that cannot start, on a browser with no WebGL or after a lost chunk,
 * gives way to the still frame rather than taking the page down with it. */
export class GlobeBoundary extends Component<GlobeBoundaryProps, GlobeBoundaryState> {
  state: GlobeBoundaryState = { failed: false };

  static getDerivedStateFromError(): GlobeBoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
