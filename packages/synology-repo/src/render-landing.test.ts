// The landing page's template fill, and the one place the nightly wording lives.
//
// This page is what a user lands on when they add the package source to their
// NAS, so it is the last thing that tells them which channel they are about to
// trust. The two risks are that a token silently renders as nothing - leaving a
// sentence like "add  to Package Center" - and that the stable and nightly
// wordings drift apart, which is exactly what `channelSubs` exists to prevent by
// being the only place either is written.

import { describe, expect, it } from 'vitest';
import { channelSubs, renderLanding } from './render-landing';

describe('renderLanding', () => {
  it('fills a token from the substitutions', () => {
    expect(renderLanding('Add {{SOURCE_NAME}} to DSM', { SOURCE_NAME: 'KROMA' })).toBe(
      'Add KROMA to DSM',
    );
  });

  it('fills every occurrence, not just the first', () => {
    // The download url appears in a button and in the copyable field below it.
    expect(renderLanding('{{URL}} and {{URL}}', { URL: 'x' })).toBe('x and x');
  });

  it('removes a token it has no value for', () => {
    // Not left as `{{MISSING}}`: a literal token on a published page reads as a
    // broken build, while an empty string is what an optional field means.
    expect(renderLanding('a{{MISSING}}b', {})).toBe('ab');
  });

  it('renders an empty value as empty', () => {
    // CHANNEL_SUFFIX is '' on stable, and that is a value rather than an
    // omission.
    expect(renderLanding('KROMA{{CHANNEL_SUFFIX}}', { CHANNEL_SUFFIX: '' })).toBe('KROMA');
  });

  it('leaves braces that are not tokens alone', () => {
    // The template carries CSS, which is full of them.
    const css = '.a { color: red } {{X}} {{ spaced }} {{}}';
    expect(renderLanding(css, { X: 'ok' })).toBe('.a { color: red } ok {{ spaced }} {{}}');
  });

  it('passes markup through, because some substitutions ARE markup', () => {
    // BETA_TRUST_HINT carries a <b> tag on purpose.
    expect(renderLanding('{{HINT}}', { HINT: ', and enable <b>beta packages</b>' })).toContain(
      '<b>',
    );
  });

  it('does not rescan what it just substituted', () => {
    // A value that happens to contain a token must be text, not a second pass -
    // otherwise a version string could reach into the substitution map.
    expect(renderLanding('{{A}}', { A: '{{B}}', B: 'nope' })).toBe('{{B}}');
  });

  it('returns a template with no tokens unchanged', () => {
    expect(renderLanding('<html>plain</html>', {})).toBe('<html>plain</html>');
  });
});

describe('channelSubs', () => {
  it('says nothing extra on the stable channel', () => {
    expect(channelSubs(false, 'KROMA')).toEqual({
      CHANNEL_SUFFIX: '',
      SOURCE_NAME: 'KROMA',
      BETA_TRUST_HINT: '',
    });
  });

  it('marks the nightly channel everywhere it appears', () => {
    const nightly = channelSubs(true, 'KROMA');
    // A user who adds the nightly source thinking it is stable gets an
    // unreviewed build pushed to their NAS, so every mention has to say so.
    expect(nightly.CHANNEL_SUFFIX).toBe(' (nightly)');
    expect(nightly.SOURCE_NAME).toBe('KROMA nightly');
    expect(nightly.BETA_TRUST_HINT).toContain('beta packages');
  });

  it('carries the package’s own display name into the source name', () => {
    expect(channelSubs(false, 'Attic').SOURCE_NAME).toBe('Attic');
    expect(channelSubs(true, 'Attic').SOURCE_NAME).toBe('Attic nightly');
  });

  it('answers the same three fields either way', () => {
    // The template fills all three unconditionally; a missing one renders as a
    // gap in a sentence.
    expect(Object.keys(channelSubs(true, 'KROMA')).sort()).toEqual(
      Object.keys(channelSubs(false, 'KROMA')).sort(),
    );
  });

  it('drops into the template without leaving a token behind', () => {
    const template = '<h1>{{SOURCE_NAME}}{{CHANNEL_SUFFIX}}</h1><p>Add it{{BETA_TRUST_HINT}}.</p>';
    for (const beta of [false, true]) {
      const html = renderLanding(template, channelSubs(beta, 'KROMA'));
      expect(html).not.toContain('{{');
    }
  });
});
