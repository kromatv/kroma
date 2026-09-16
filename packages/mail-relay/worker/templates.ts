import en from './locales/en.json';
import fr from './locales/fr.json';
import type { Locale } from './schemas';

type Key = keyof typeof en;

const CATALOGS: Record<Locale, Record<Key, string>> = { en, fr };

const BG = '#0A0A0C';
const CARD = '#121216';
const EDGE = '#26262E';
const INK = '#F4F3F0';
const MUTED = '#9B9B99';
const DIM = '#7A7A79';
const ACCENT = '#F4B642';
const FONT = "'Hanken Grotesk',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function t(locale: Locale, key: Key, vars: Record<string, string> = {}): string {
  let out: string = CATALOGS[locale][key];
  for (const [name, value] of Object.entries(vars)) out = out.replaceAll(`{${name}}`, value);
  return out;
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function card(locale: Locale, title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};">
<tr><td align="center" style="padding:48px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background-color:${CARD};border:1px solid ${EDGE};border-radius:16px;overflow:hidden;font-family:${FONT};">
<tr><td align="center" style="padding:36px 40px 0;"><img src="cid:logo" width="120" alt="KROMA" style="display:block;border:0;"></td></tr>
${body}
<tr><td align="center" style="padding:28px 40px 36px;"><div style="font-size:12px;line-height:1.6;color:${DIM};">${escapeHtml(t(locale, 'relay.name'))}</div></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const heading = (text: string) =>
  `<tr><td align="center" style="padding:26px 40px 0;"><div style="font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;color:${INK};">${escapeHtml(text)}</div></td></tr>`;

const paragraph = (text: string, color = MUTED) =>
  `<tr><td align="center" style="padding:14px 40px 0;"><div style="font-size:15px;line-height:1.6;color:${color};">${escapeHtml(text)}</div></td></tr>`;

const button = (inner: string) =>
  `<tr><td align="center" style="padding:28px 40px 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${ACCENT}" style="border-radius:12px;">${inner}</td></tr></table></td></tr>`;

const BUTTON_STYLE = `display:inline-block;padding:14px 34px;font-size:15px;font-weight:700;color:${BG};text-decoration:none;border-radius:12px;background-color:${ACCENT};border:0;font-family:${FONT};cursor:pointer;`;

export interface ConsentEmail {
  subject: string;
  text: string;
  html: string;
}

/** The one email the relay sends unasked: a fixed template in which the
 * server chose only `name`, and every link is the relay's own. */
export function consentEmail(
  locale: Locale,
  vars: { name: string; host: string; url: string },
): ConsentEmail {
  const body = [
    `<tr><td><div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(t(locale, 'consent.preheader', vars))}</div></td></tr>`,
    heading(t(locale, 'consent.heading')),
    paragraph(t(locale, 'consent.intro', vars)),
    button(
      `<a href="${escapeHtml(vars.url)}" style="${BUTTON_STYLE}">${escapeHtml(t(locale, 'consent.button'))}</a>`,
    ),
    `<tr><td align="center" style="padding:26px 40px 0;"><div style="font-size:12px;line-height:1.6;color:${DIM};word-break:break-all;">${escapeHtml(vars.url)}</div></td></tr>`,
    paragraph(t(locale, 'consent.footer', vars), DIM),
  ].join('\n');
  return {
    subject: t(locale, 'consent.subject', vars),
    text: t(locale, 'consent.text', vars),
    html: card(locale, t(locale, 'consent.subject', vars), body),
  };
}

/** The page behind a consent link. Consent is the POST the button makes, never the GET. */
export function confirmPage(
  locale: Locale,
  vars: { name: string; host: string; address: string; action: string },
): string {
  const body = [
    heading(t(locale, 'page.title', vars)),
    paragraph(t(locale, 'page.intro', vars)),
    button(
      `<form method="post" action="${escapeHtml(vars.action)}" style="margin:0;"><button type="submit" style="${BUTTON_STYLE}">${escapeHtml(t(locale, 'page.allow'))}</button></form>`,
    ),
    paragraph(t(locale, 'page.deny'), DIM),
  ].join('\n');
  return card(locale, t(locale, 'page.title', vars), body);
}

export function invalidPage(locale: Locale): string {
  const body = [
    heading(t(locale, 'page.invalidTitle')),
    paragraph(t(locale, 'page.invalidDesc')),
  ].join('\n');
  return card(locale, t(locale, 'page.invalidTitle'), body);
}
