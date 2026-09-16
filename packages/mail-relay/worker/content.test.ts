import { describe, expect, it } from 'vitest';
import { refuseContent } from './content';

const ORIGIN = 'https://kroma.example';

const html = (inner: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<table role="presentation"><tr><td>
<img src="cid:logo" width="120" alt="KROMA">
${inner}
</td></tr></table></body></html>`;

describe('what may leave through a grant', () => {
  it('lets the server’s own reset email through', () => {
    const page = html(
      `<a href="${ORIGIN}/reset?token=abc" style="color:#0A0A0C;">Choose a new password</a>
       <div style="word-break:break-all;">${ORIGIN}/reset?token=abc</div>`,
    );

    expect(refuseContent(ORIGIN, `Open ${ORIGIN}/reset?token=abc to continue.`, page)).toBeNull();
  });

  it('refuses a link that leads anywhere else, in an attribute or in prose', () => {
    expect(refuseContent(ORIGIN, 'ok', html('<a href="https://evil.example/x">go</a>'))).toMatch(
      /link leads off/,
    );
    expect(refuseContent(ORIGIN, 'ok', html('<a href=https://evil.example>go</a>'))).toMatch(
      /link leads off/,
    );
    expect(refuseContent(ORIGIN, 'ok', html('see https://evil.example/x'))).toMatch(
      /link leads off/,
    );
    expect(refuseContent(ORIGIN, 'ok', html('see www.evil.example'))).toMatch(/link leads off/);
    expect(refuseContent(ORIGIN, `see https://evil.example`, html('ok'))).toMatch(
      /^text: a link leads off/,
    );
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
      expect(refuseContent(ORIGIN, 'ok', html(`<a href="${bad}">go</a>`)), bad).toMatch(
        /link leads off/,
      );
    }
  });

  it('refuses anything that runs, submits, embeds or redirects', () => {
    for (const bad of [
      '<script>1</script>',
      '<SCRIPT src="x">',
      '< script>',
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
    ]) {
      expect(refuseContent(ORIGIN, 'ok', html(bad)), bad).not.toBeNull();
    }
  });

  it('does not let a quoted > hide the attributes after it', () => {
    for (const smuggled of [
      '<a title=">" href="//evil.example/x">go</a>',
      '<a title=">" onclick="1">go</a>',
      "<img alt='>' src='https://evil.example/p.png'>",
    ]) {
      expect(refuseContent(ORIGIN, 'ok', html(smuggled)), smuggled).not.toBeNull();
    }
  });

  it('refuses css that loads or runs, wherever it sits', () => {
    for (const bad of [
      '<style>@import "https://kroma.example/x.css";</style>',
      '<div style="width:expression(1)">',
      '<div style="behavior:url(#x)">',
    ]) {
      expect(refuseContent(ORIGIN, 'ok', html(bad)), bad).not.toBeNull();
    }
  });

  it('lets prose through unless it is spelled exactly like a handler', () => {
    expect(refuseContent(ORIGIN, 'ok', html('<p>Saison 1, version=3, region=eu</p>'))).toBeNull();
    expect(refuseContent(ORIGIN, 'ok', html('<p>one=two</p>'))).not.toBeNull();
  });

  it('matches the origin without regard to case', () => {
    expect(
      refuseContent(ORIGIN, 'ok', html('<a href="HTTPS://KROMA.EXAMPLE/reset">go</a>')),
    ).toBeNull();
  });
});
