import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const WIDGET_FILES: Record<string, string> = {
  'config.xml': `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://kroma.tv/fixture" version="1.0.0" viewmodes="maximized">
  <tizen:application id="KromaTV001.FIXTURE" package="KromaTV001" required_version="6.0"/>
  <content src="index.html"/>
  <name>FIXTURE</name>
  <tizen:profile name="tv"/>
</widget>
`,
  'index.html': `<!doctype html>
<title>fixture</title>
`,
  'assets/app main.js': `export const kroma = 1;
`,
};

export const AUTHOR_SIGNATURE = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#" Id="AuthorSignature">
<SignedInfo>
<CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod>
<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"></SignatureMethod>
<Reference URI="assets%2Fapp%20main.js">
<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></DigestMethod>
<DigestValue>ghTRLHaKyWpXopaRzqX0gVvYYGh7KgDXzz5qlyPsCZxuJ/p0tGgb1gKmxPoJNZDBgKxNIiHETqxu
Kv8z8lOAaA==</DigestValue>
</Reference>
<Reference URI="config.xml">
<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></DigestMethod>
<DigestValue>E9IieFtveRQ9PQK+bopWRxrrd911oq/yw+VT8OVCZOH/Gm6dhK9hhKmdXHncV6W6M/gMekWYXAaN
5owExF6WyQ==</DigestValue>
</Reference>
<Reference URI="index.html">
<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></DigestMethod>
<DigestValue>DbDCOYg9U+gHT4ohlUF28q+iWQCcj1LpGGq7SHUcXexKuKQq8N7tqqE//oyLgIfkUkpgACPLv978
llyC80222w==</DigestValue>
</Reference>
<Reference URI="#prop">
<Transforms>
<Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"></Transform>
</Transforms>
<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></DigestMethod>
<DigestValue>aXbSAVgmAz0GsBUeZ1UmNDRrxkWhDUVGb45dZcNRq429wX3X+x6kaXT3NdNDTSNVTU+ypkysPMGv
QY10fG1EWQ==</DigestValue>
</Reference>
</SignedInfo>
<SignatureValue>SIGNER</SignatureValue>
<KeyInfo>
<X509Data>SIGNER</X509Data>
</KeyInfo>
<Object Id="prop"><SignatureProperties xmlns:dsp="http://www.w3.org/2009/xmldsig-properties"><SignatureProperty Id="profile" Target="#AuthorSignature"><dsp:Profile URI="http://www.w3.org/ns/widgets-digsig#profile"></dsp:Profile></SignatureProperty><SignatureProperty Id="role" Target="#AuthorSignature"><dsp:Role URI="http://www.w3.org/ns/widgets-digsig#role-author"></dsp:Role></SignatureProperty><SignatureProperty Id="identifier" Target="#AuthorSignature"><dsp:Identifier></dsp:Identifier></SignatureProperty></SignatureProperties></Object>
</Signature>`;

export const DISTRIBUTOR_SIGNATURE = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#" Id="DistributorSignature">
<SignedInfo>
<CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod>
<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"></SignatureMethod>
<Reference URI="assets%2Fapp%20main.js">
<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></DigestMethod>
<DigestValue>ghTRLHaKyWpXopaRzqX0gVvYYGh7KgDXzz5qlyPsCZxuJ/p0tGgb1gKmxPoJNZDBgKxNIiHETqxu
Kv8z8lOAaA==</DigestValue>
</Reference>
<Reference URI="author-signature.xml">
<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></DigestMethod>
<DigestValue>SIGNER</DigestValue>
</Reference>
<Reference URI="config.xml">
<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></DigestMethod>
<DigestValue>E9IieFtveRQ9PQK+bopWRxrrd911oq/yw+VT8OVCZOH/Gm6dhK9hhKmdXHncV6W6M/gMekWYXAaN
5owExF6WyQ==</DigestValue>
</Reference>
<Reference URI="index.html">
<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></DigestMethod>
<DigestValue>DbDCOYg9U+gHT4ohlUF28q+iWQCcj1LpGGq7SHUcXexKuKQq8N7tqqE//oyLgIfkUkpgACPLv978
llyC80222w==</DigestValue>
</Reference>
<Reference URI="#prop">
<Transforms>
<Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"></Transform>
</Transforms>
<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></DigestMethod>
<DigestValue>/r5npk2VVA46QFJnejgONBEh4BWtjrtu9x/IFeLksjWyGmB/cMWKSJWQl7aU3YRQRZ3AesG8gF7q
GyvKX9Snig==</DigestValue>
</Reference>
</SignedInfo>
<SignatureValue>SIGNER</SignatureValue>
<KeyInfo>
<X509Data>SIGNER</X509Data>
</KeyInfo>
<Object Id="prop"><SignatureProperties xmlns:dsp="http://www.w3.org/2009/xmldsig-properties"><SignatureProperty Id="profile" Target="#DistributorSignature"><dsp:Profile URI="http://www.w3.org/ns/widgets-digsig#profile"></dsp:Profile></SignatureProperty><SignatureProperty Id="role" Target="#DistributorSignature"><dsp:Role URI="http://www.w3.org/ns/widgets-digsig#role-distributor"></dsp:Role></SignatureProperty><SignatureProperty Id="identifier" Target="#DistributorSignature"><dsp:Identifier></dsp:Identifier></SignatureProperty></SignatureProperties></Object>
</Signature>`;
/** Writes the files into a fresh temporary directory and returns its path. */
export function writeWidget(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'kroma-widget-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), content);
  }
  return directory;
}
