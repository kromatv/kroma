// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { accessOf, nameOf, roleOf } from './a11y';

function mount(html: string): readonly Element[] {
  document.body.innerHTML = html;
  return [...document.body.children];
}

const lines = (html: string) => accessOf(mount(html)).lines;
const kinds = (html: string) => accessOf(mount(html)).findings.map((finding) => finding.kind);
const notes = (html: string) => accessOf(mount(html)).findings.map((finding) => finding.note);
const one = (html: string) => mount(html)[0] as Element;

describe('roleOf', () => {
  it('reads the role a tag already has', () => {
    expect(roleOf(one('<button></button>'))).toBe('button');
    expect(roleOf(one('<a href="/x"></a>'))).toBe('link');
    expect(roleOf(one('<a></a>'))).toBe('');
    expect(roleOf(one('<textarea></textarea>'))).toBe('textbox');
    expect(roleOf(one('<select></select>'))).toBe('combobox');
    expect(roleOf(one('<input type="search"/>'))).toBe('searchbox');
    expect(roleOf(one('<input type="checkbox"/>'))).toBe('checkbox');
  });

  it('lets an explicit role win, which is how react-native-web spells one', () => {
    expect(roleOf(one('<div role="slider"></div>'))).toBe('slider');
  });
});

describe('nameOf', () => {
  it('follows the accname chain a kit component can reach', () => {
    const roots = mount(
      '<div id="ref">By reference</div><div aria-labelledby="ref" aria-label="Own"></div>',
    );
    expect(nameOf(roots[1] as Element)).toBe('By reference');
    expect(nameOf(one('<div aria-label="Own" title="Tip">Inside</div>'))).toBe('Own');
    expect(nameOf(one('<img src="a.png" alt="Poster" title="Tip"/>'))).toBe('Poster');
    expect(nameOf(one('<div title="Tip">Inside</div>'))).toBe('Tip');
    expect(nameOf(one('<div>Inside</div>'))).toBe('Inside');
  });

  it('reads a text entry by its placeholder, never by the value it holds', () => {
    expect(nameOf(one('<textarea placeholder="Write a comment">typed so far</textarea>'))).toBe(
      'Write a comment',
    );
    expect(nameOf(one('<textarea>typed so far</textarea>'))).toBe('');
    expect(nameOf(one('<input placeholder="Search"/>'))).toBe('Search');
    expect(
      nameOf(one('<input aria-label="Search the catalogue" placeholder="Blade Runner"/>')),
    ).toBe('Search the catalogue');
  });
});

describe('the accessible tree it writes down', () => {
  it('keeps one line per element a reader stops on, and says which take a tab stop', () => {
    expect(lines('<div><button aria-label="Play"></button><span>text</span></div>')).toEqual([
      'button "Play" tab',
    ]);
  });

  it('counts a link with an href as a tab stop and one without as neither', () => {
    expect(lines('<a href="/x">Open</a>')).toEqual(['link "Open" tab']);
    expect(lines('<a>Open</a>')).toEqual([]);
  });

  it('leaves a disabled control out of the tab order, where `disabled` is real HTML', () => {
    expect(lines('<button disabled aria-label="Play"></button>')).toEqual(['button "Play"']);
    expect(lines('<div disabled tabindex="0" role="button" aria-label="Play"></div>')).toEqual([
      'button "Play" tab',
    ]);
  });

  it('writes a state and a live region down even where there is no role', () => {
    expect(lines('<div aria-live="polite">Saved</div>')).toEqual(['div "Saved" [live=polite]']);
  });
});

describe('what it calls a finding', () => {
  it('reads a control that announces as nothing', () => {
    expect(kinds('<div role="button"></div>')).toContain('nameless-control');
    expect(kinds('<div role="button" aria-label="Play" tabindex="0"></div>')).toEqual([]);
  });

  it('says nothing about a control a reader cannot hear at all', () => {
    expect(kinds('<div aria-hidden="true"><div role="button"></div></div>')).toEqual([]);
  });

  it('reads a role that carries a state and does not say it', () => {
    expect(notes('<div role="switch" aria-label="Subtitles" tabindex="0"></div>')).toEqual([
      'role=switch carries no aria-checked',
    ]);
    expect(kinds('<div role="tab" aria-label="Cast" tabindex="0"></div>')).toEqual([
      'stateless-control',
    ]);
  });

  it('reads a range that announces no position, which is the half of one the DOM proves', () => {
    expect(notes('<div role="slider" aria-label="Volume"></div>')).toEqual([
      'role=slider carries no aria-valuenow',
    ]);
    expect(kinds('<div role="slider" aria-label="Volume" aria-valuenow="70"></div>')).toEqual([]);
  });

  it('reads an entry with no name, and says it once rather than twice', () => {
    expect(kinds('<input/>')).toEqual(['unlabelled-input']);
    expect(kinds('<textarea></textarea>')).toEqual(['unlabelled-input']);
    expect(kinds('<input placeholder="Search"/>')).toEqual([]);
    expect(kinds('<input aria-label="Amount"/>')).toEqual([]);
  });

  it('reads an aria-labelledby pointing at nothing', () => {
    expect(kinds('<div role="button" aria-labelledby="gone" tabindex="0"></div>')).toEqual([
      'nameless-control',
      'dangling-labelledby',
    ]);
    expect(
      kinds(
        '<div><span id="here">Play</span><div role="button" aria-labelledby="here" tabindex="0"></div></div>',
      ),
    ).toEqual([]);
  });

  it('reads a tabindex that reorders the page', () => {
    expect(kinds('<div role="button" aria-label="Play" tabindex="3"></div>')).toEqual([
      'positive-tabindex',
    ]);
  });

  it('reads a branch hidden from readers that the keyboard still walks into', () => {
    expect(kinds('<div aria-hidden="true"><button>Play</button></div>')).toContain(
      'hidden-focusable',
    );
    expect(kinds('<div aria-hidden="true"><span>Play</span></div>')).toEqual([]);
  });

  it('reads an image that says nothing about itself, empty alt included', () => {
    expect(kinds('<img src="a.png"/>')).toEqual(['imageless-alt']);
    expect(kinds('<img src="a.png" alt=""/>')).toEqual([]);
  });
});

describe('what it calls unreachable', () => {
  it('reads a pressable control the keyboard cannot get to', () => {
    expect(kinds('<div role="button" aria-label="Play"></div>')).toEqual(['unreachable-control']);
    expect(kinds('<div role="button" aria-label="Play" tabindex="0"></div>')).toEqual([]);
  });

  it('leaves a control that is unavailable rather than unreachable', () => {
    expect(kinds('<div role="button" aria-label="Play" aria-disabled="true"></div>')).toEqual([]);
    expect(kinds('<button disabled aria-label="Play"></button>')).toEqual([]);
  });

  it('leaves a control nothing can reach anyway', () => {
    expect(kinds('<div role="button" aria-label="Play" style="display: none"></div>')).toEqual([]);
    expect(
      kinds('<div role="button" aria-label="Play" style="pointer-events: none"></div>'),
    ).toEqual([]);
  });

  it('leaves a row of the activedescendant pattern, where the container holds focus', () => {
    const listbox =
      '<div role="listbox" tabindex="0" aria-activedescendant="row" aria-label="Category">' +
      '<div role="option" id="row" aria-label="Server status" aria-selected="true" tabindex="-1"></div></div>';
    expect(kinds(listbox)).toEqual([]);
    expect(
      kinds(
        '<div role="listbox" tabindex="0" aria-label="Category"><div role="option" aria-label="Server status" aria-selected="true" tabindex="-1"></div></div>',
      ),
    ).toEqual(['unreachable-control']);
  });

  it('leaves a row a combobox owns through aria-controls, though the popover is a portal', () => {
    const combobox =
      '<div role="combobox" tabindex="0" aria-label="Genre" aria-activedescendant="row" aria-controls="popover"></div>';
    const popover =
      '<div id="popover" role="listbox" aria-label="Genres">' +
      '<div role="option" id="row" aria-label="Science fiction" aria-selected="true" tabindex="-1"></div></div>';

    expect(kinds(combobox + popover)).toEqual([]);
  });

  it('still reads a row nothing points at as unreachable, wherever the pointer leads', () => {
    const row =
      '<div role="option" id="row" aria-label="Science fiction" aria-selected="true" tabindex="-1"></div>';
    const owner = (controls: string) =>
      `<div role="combobox" tabindex="0" aria-label="Genre" aria-activedescendant="row"${controls}></div>`;

    expect(kinds(owner('') + row)).toEqual(['unreachable-control']);
    expect(kinds(`${owner(' aria-controls="elsewhere"')}<div id="elsewhere"></div>${row}`)).toEqual(
      ['unreachable-control'],
    );
    expect(kinds(owner(' aria-controls="gone"') + row)).toEqual(['unreachable-control']);
  });

  it('says nothing about a range, whose gesture and key map are not in the DOM', () => {
    expect(kinds('<div role="slider" aria-label="Seek bar" aria-valuenow="164"></div>')).toEqual(
      [],
    );
  });

  it('names where it found one, so a view with twenty controls is navigable', () => {
    const findings = accessOf(
      mount('<div><span>x</span><div role="button" aria-label="Play"></div></div>'),
    ).findings;

    expect(findings[0]?.at).toBe('div > div:1');
  });
});
