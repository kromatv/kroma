// @vitest-environment jsdom
import { StyleSheet } from 'react-native';
// @ts-expect-error react-native-web ships no types for its sheet factory
import createOrderedCSSStyleSheet from 'react-native-web/dist/exports/StyleSheet/dom/createOrderedCSSStyleSheet';
import { describe, expect, it } from 'vitest';
import { injectRules } from './inject';

type Sheet = { getSheet(): { textContent: string } };

const sheetText = () => (StyleSheet as unknown as Sheet).getSheet().textContent.replace(/\s+/g, '');

describe('injectRules', () => {
  it('inserts each rule once, in group order, into the renderer sheet', () => {
    injectRules([
      [3, '.aaaaa1{opacity:0.5;}'],
      [2, '.aaaaa2{margin:0px;}'],
    ]);
    injectRules([
      [3, '.aaaaa1{opacity:0.5;}'],
      [3, '.aaaaa3{top:0px;}'],
    ]);

    const text = sheetText();
    expect(text.split('.aaaaa1{')).toHaveLength(2);
    expect(text.indexOf('.aaaaa2{')).toBeLessThan(text.indexOf('.aaaaa1{'));
    expect(text.indexOf('.aaaaa1{')).toBeLessThan(text.indexOf('.aaaaa3{'));
  });

  it('skips a rule the engine cannot parse and keeps going', () => {
    expect(() =>
      injectRules([
        [3, 'not css at all'],
        [3, '.aaaaa4{left:0px;}'],
      ]),
    ).not.toThrow();

    expect(sheetText()).toContain('.aaaaa4{left:0px;}');
  });
});

describe('the renderer sheet', () => {
  it('inserts nothing for a selector the static stylesheet already holds', () => {
    const built = document.createElement('style');
    built.textContent = '.bbbbb1{opacity:0.5;}.not-atomic{opacity:0.5;}';
    document.head.append(built);
    const element = document.createElement('style');
    document.head.append(element);

    const sheet = createOrderedCSSStyleSheet(element.sheet);
    sheet.insert('.bbbbb1{opacity:0.5;}', 3);
    sheet.insert('.bbbbb2{opacity:0.5;}', 3);
    sheet.insert('.not-atomic{opacity:0.5;}', 3);

    const text = sheet.getTextContent().replace(/\s+/g, '');
    expect(text).not.toContain('.bbbbb1{');
    expect(text).toContain('.bbbbb2{opacity:0.5;}');
    expect(text).toContain('.not-atomic{opacity:0.5;}');
  });
});
