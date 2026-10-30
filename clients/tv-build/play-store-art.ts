import { colors, mobileRadius, mobileTypeSpec } from '@kromatv/ui/tokens';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const repo = resolve(import.meta.dirname, '../..');
const store = resolve(repo, 'store/google-play');
const rawCaptures: Record<string, string> = {
  'en-US': resolve(store, 'captures/android-phone'),
  'fr-FR': resolve(store, 'captures/android-phone-fr'),
};
const metadata = resolve(repo, 'fastlane/metadata/android');

function data(path: string, mime: string) {
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

const lockup = data(resolve(repo, '.github/assets/kroma-lockup-ivory.svg'), 'image/svg+xml');
const icon = data(resolve(repo, 'clients/mobile/assets/images/icon.png'), 'image/png');
const fontRoot = new URL('./fonts/', import.meta.resolve('@kromatv/ui/fonts'));
const displayFont = data(
  new URL('bricolage-grotesque-latin.woff2', fontRoot).pathname,
  'font/woff2',
);
const bodyFont = data(new URL('hanken-grotesk-latin.woff2', fontRoot).pathname, 'font/woff2');

const captions = {
  'en-US': {
    feature: 'Your cinema.\nEvery screen.',
    featureBody: 'Your library, beautifully at home.',
    footer: 'FREE & OPEN SOURCE · BRING YOUR OWN SERVER',
    shots: [
      ['01-movies', 'Your cinema.\nIn your pocket.', 'A beautiful home for your movies.'],
      ['02-detail', 'The story\nstarts here.', 'Artwork, cast and details, all in one place.'],
      [
        '03-home',
        'What’s on\ntonight?',
        'Your list and latest additions, right on the home screen.',
      ],
    ],
  },
  'fr-FR': {
    feature: 'Votre cinéma.\nSur tous vos écrans.',
    featureBody: 'Toute votre collection, au même endroit.',
    footer: 'GRATUIT ET OPEN SOURCE · VOTRE PROPRE SERVEUR',
    shots: [
      ['01-movies', 'Votre cinéma.\nPartout avec vous.', 'Tous vos films, rangés et prêts à lancer.'],
      ['02-detail', 'Tout sur\nvotre film.', 'L’affiche, le résumé, les détails : tout est là.'],
      [
        '03-home',
        'On regarde\nquoi ce soir ?',
        'Votre liste et vos derniers ajouts, dès l’accueil.',
      ],
    ],
  },
} as const;

function escape(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function htmlDocument(body: string, style: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:Display;src:url('${displayFont}');font-weight:100 900}
    @font-face{font-family:Body;src:url('${bodyFont}');font-weight:100 900}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
    body{background:${colors.bg};color:${colors.text};font-family:Body,sans-serif}
    h1,p{margin:0}h1{font-family:Display,sans-serif;white-space:pre-line;letter-spacing:-.045em;font-weight:800}
    ${style}</style></head><body>${body}</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(html: string, width: number, height: number, path: string) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, type: 'png', omitBackground: false });
  console.log(`${path.slice(repo.length + 1)} ${width}×${height}`);
}

for (const [locale, copy] of Object.entries(captions)) {
  const images = resolve(metadata, locale, 'images');
  await render(
    htmlDocument(`<img src="${icon}" style="width:100%;height:100%">`, ''),
    512,
    512,
    resolve(images, 'icon.png'),
  );
  await render(
    htmlDocument(
      `<div class="bloom"></div><img class="brand" src="${lockup}"><h1>${escape(copy.feature)}</h1><p>${escape(copy.featureBody)}</p><div class="orbit"><img src="${icon}"></div>`,
      `.bloom{position:absolute;inset:0;background:radial-gradient(ellipse at 82% 72%,${colors.accentSoft},transparent 67%)}
      .brand{position:absolute;left:66px;top:60px;width:213px}h1{position:absolute;left:66px;top:160px;font-size:${mobileTypeSpec.display.size * 1.9}px;line-height:1.04;max-width:650px}
      p{position:absolute;left:70px;bottom:64px;font-size:${mobileTypeSpec.body.size * 1.3}px;color:${colors.textMuted}}
      .orbit{position:absolute;width:390px;height:390px;right:-95px;top:40px;border:1px solid ${colors.borderStrong};border-radius:50%;padding:34px;transform:rotate(-16deg)}
      .orbit img{width:100%;height:100%;border-radius:50%}`,
    ),
    1024,
    500,
    resolve(images, 'featureGraphic.png'),
  );
  await render(
    htmlDocument(
      `<div class="bloom"></div><img class="brand" src="${lockup}"><p>${escape(copy.featureBody)}</p>`,
      `.bloom{position:absolute;inset:0;background:radial-gradient(ellipse at center,${colors.accentSoft},transparent 72%)}
      .brand{position:absolute;left:240px;top:250px;width:800px}
      p{position:absolute;left:0;right:0;top:480px;text-align:center;font-size:${mobileTypeSpec.heading.size * 1.8}px;color:${colors.textMuted}}`,
    ),
    1280,
    720,
    resolve(images, 'tvBanner.png'),
  );
  for (const [name, headline, description] of copy.shots) {
    const capture = data(resolve(rawCaptures[locale], `${name}.png`), 'image/png');
    await render(
      htmlDocument(
        `<div class="bloom"></div><img class="brand" src="${lockup}"><span class="index">${name.slice(0, 2)} / 03</span><h1>${escape(headline)}</h1><p class="description">${escape(description)}</p><div class="phone"><img src="${capture}"></div><p class="footer">${escape(copy.footer)}</p>`,
        `.bloom{position:absolute;inset:0;background:radial-gradient(ellipse at 70% 66%,${colors.accentSoft},transparent 58%)}
        .brand{position:absolute;left:96px;top:90px;width:280px}.index{position:absolute;right:100px;top:108px;color:${colors.textDim};font-size:${mobileTypeSpec.small.size * 2}px;letter-spacing:.13em}
        h1{position:absolute;left:96px;top:250px;font-size:${mobileTypeSpec.display.size * 3.4}px;line-height:1.04;max-width:1260px}
        .description{position:absolute;left:102px;top:535px;font-size:${mobileTypeSpec.body.size * 2}px;line-height:1.4;color:${colors.textMuted};max-width:1170px}
        .phone{position:absolute;top:720px;left:310px;width:820px;height:1670px;border:5px solid ${colors.surface3};border-radius:${mobileRadius.xl * 2}px;overflow:hidden;box-shadow:0 48px 100px ${colors.playerBlack};background:${colors.bg}}
        .phone img{position:absolute;width:100%;left:0;top:-76px}
        .footer{position:absolute;left:0;right:0;text-align:center;bottom:48px;font-size:${mobileTypeSpec.small.size * 1.6}px;letter-spacing:.12em;color:${colors.textDim}}`,
      ),
      1440,
      2560,
      resolve(images, 'phoneScreenshots', `${name}.png`),
    );
  }
}

await browser.close();
