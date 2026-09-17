import { describe, expect, it } from 'vitest';
import { exactly, onOrigin, refuseContent } from './content';

const ORIGIN = 'https://kroma.example';
const allowed = onOrigin(ORIGIN);

const html = (inner: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<table role="presentation"><tr><td>
<img src="cid:logo" width="120" alt="KROMA">
${inner}
</td></tr></table></body></html>`;

describe('what may leave under a grant', () => {
  it('lets the server’s own reset email through', () => {
    const page = html(
      `<a href="${ORIGIN}/reset?token=abc" style="color:#0A0A0C;">Choose a new password</a>
       <div style="word-break:break-all;">${ORIGIN}/reset?token=abc</div>`,
    );

    expect(refuseContent(allowed, `Open ${ORIGIN}/reset?token=abc to continue.`, page)).toBeNull();
  });

  it('refuses a link that leads anywhere else, in an attribute or in prose', () => {
    expect(refuseContent(allowed, 'ok', html('<a href="https://evil.example/x">go</a>'))).toMatch(
      /leads where/,
    );
    expect(refuseContent(allowed, 'ok', html('<a href=https://evil.example>go</a>'))).toMatch(
      /leads where/,
    );
    expect(refuseContent(allowed, 'ok', html('see https://evil.example/x'))).toMatch(/leads where/);
    expect(refuseContent(allowed, 'ok', html('see www.evil.example'))).toMatch(/leads where/);
    expect(refuseContent(allowed, 'see https://evil.example', html('ok'))).toMatch(/^text: /);
  });

  it('refuses a lookalike origin', () => {
    for (const bad of [
      'https://kroma.example.evil.com/x',
      'https://kroma.example@evil.com/x',
      'https://kroma.examplex/x',
      '//evil.com/x',
      '/reset?token=abc',
      'javascript:alert(1)',
      'data:text/html,hi',
      '&#106;avascript:alert(1)',
    ]) {
      expect(refuseContent(allowed, 'ok', html(`<a href="${bad}">go</a>`)), bad).toMatch(
        /leads where/,
      );
    }
  });

  it('refuses anything that runs, submits, embeds or redirects', () => {
    for (const bad of [
      '<script>1</script>',
      '<SCRIPT src="x">',
      '<form action="https://kroma.example/x"></form>',
      '<iframe src="https://kroma.example/x">',
      '<object data="x">',
      '<embed src="x">',
      '<base href="https://kroma.example/">',
      '<svg onload="1">',
      '<link rel="stylesheet" href="https://kroma.example/x">',
      '<meta http-equiv="refresh" content="0;url=https://kroma.example">',
      '<img src="cid:logo" onerror="1">',
      '<img srcset="https://kroma.example/a 1x">',
      '<div style="background:url(https://kroma.example/x)">',
      '<style>@import "https://kroma.example/x.css";</style>',
      '<div style="width:expression(1)">',
    ]) {
      expect(refuseContent(allowed, 'ok', html(bad)), bad).not.toBeNull();
    }
  });

  it('does not let a quoted > hide the attributes after it', () => {
    for (const smuggled of [
      '<a title=">" href="//evil.example/x">go</a>',
      '<a title=">" onclick="1">go</a>',
      "<img alt='>' src='https://evil.example/p.png'>",
    ]) {
      expect(refuseContent(allowed, 'ok', html(smuggled)), smuggled).not.toBeNull();
    }
  });

  it('lets prose through unless it is spelled exactly like a handler', () => {
    expect(refuseContent(allowed, 'ok', html('<p>Saison 1, version=3, region=eu</p>'))).toBeNull();
    expect(refuseContent(allowed, 'ok', html('<p>one=two</p>'))).not.toBeNull();
  });

  it('matches the origin without regard to case', () => {
    expect(
      refuseContent(allowed, 'ok', html('<a href="HTTPS://KROMA.EXAMPLE/reset">go</a>')),
    ).toBeNull();
  });
});

describe('what may leave as the question', () => {
  const link = 'https://mail.kroma.tv/confirm/v1.abc';
  const only = exactly(link);

  it('is one link, repeated as often as the template likes, and nothing else', () => {
    expect(
      refuseContent(only, `Open ${link}`, html(`<a href="${link}">Allow</a><div>${link}</div>`)),
    ).toBeNull();
    expect(refuseContent(only, `Open ${link}`, html(`<a href="${link}/">Allow</a>`))).toMatch(
      /leads where/,
    );
    expect(refuseContent(only, `Open ${link}`, html(`<a href="${ORIGIN}">Allow</a>`))).toMatch(
      /leads where/,
    );
    expect(refuseContent(only, `Open ${link} or ${ORIGIN}`, html('<p>x</p>'))).toMatch(/^text: /);
  });
});
