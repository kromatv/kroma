const LIKELY_REGION = `
  aa:ET ab:GE ae:IR af:ZA ak:GH am:ET an:ES ar:EG as:IN av:RU ay:BO az:AZ az-Arab:IR ba:RU
  be:BY bg:BG bh:IN bi:VU bm:ML bn:BD bo:CN br:FR bs:BA ca:ES ce:RU ch:GU co:FR cr:CA cs:CZ
  cu:RU cv:RU cy:GB da:DK de:DE dv:MV dz:BT ee:GH el:GR en:US en-Shaw:GB es:ES et:EE eu:ES
  fa:IR ff:SN ff-Adlm:GN fi:FI fj:FJ fo:FO fr:FR fy:NL ga:IE gd:GB gl:ES gn:PY gu:IN gv:IM
  ha:NG he:IL hi:IN ho:PG hr:HR ht:HT hu:HU hy:AM hz:NA id:ID ie:EE ig:NG ii:CN ik:US in:ID
  is:IS it:IT iu:CA iw:IL ja:JP ji:UA jv:ID jw:ID ka:GE kg:CD ki:KE kj:NA kk:KZ kk-Arab:CN
  kl:GL km:KH kn:IN ko:KR kr:NG ks:IN ku:TR ku-Cyrl:AM ku-Arab:IQ kv:RU kw:GB ky:KG ky-Latn:TR
  ky-Arab:CN la:VA lb:LU lg:UG li:NL ln:CD lo:LA lt:LT lu:CD lv:LV mg:MG mh:MH mi:NZ mk:MK
  ml:IN mn:MN mn-Mong:CN mo:RO mr:IN ms:MY mt:MT my:MM na:NR nb:NO nd:ZW ne:NP ng:NA nl:NL
  nn:NO no:NO nr:ZA nv:US ny:MW oc:FR oj:CA om:ET or:IN os:GE pa:IN pa-Arab:PK pi:GB pi-Deva:IN
  pl:PL ps:AF pt:BR qu:PE rm:CH rn:BI ro:RO ru:RU rw:RW sa:IN sc:IT sd:PK sd-Deva:IN se:NO
  sg:CF si:LK sk:SK sl:SI sm:WS sn:ZW so:SO sq:AL sr:RS ss:ZA st:ZA su:ID sv:SE sw:TZ ta:IN
  te:IN tg:TJ tg-Arab:PK th:TH ti:ET tk:TM tl:PH tn:ZA to:TO tr:TR ts:ZA tt:RU tw:GH ty:PF
  ug:CN ug-Cyrl:KZ uk:UA ur:PK uz:UZ uz-Arab:AF ve:ZA vi:VN wa:BE wo:SN xh:ZA yi:UA yo:NG za:CN
  zh:CN zh-Hant:TW zu:ZA
`;

let likely: ReadonlyMap<string, string> | undefined;

function table(): ReadonlyMap<string, string> {
  likely ??= new Map(
    LIKELY_REGION.trim()
      .split(/\s+/)
      .map((entry): [string, string] => {
        const [code = '', region = ''] = entry.split(':');
        return [code, region];
      }),
  );
  return likely;
}

const COUNTRY = /^[A-Z]{2}$/;

function fromIntl(code: string): string | null {
  try {
    const { region } = new Intl.Locale(code).maximize();
    return region !== undefined && COUNTRY.test(region) ? region : null;
  } catch {
    return null;
  }
}

/** The country CLDR finds a language most likely written in (`en` is `US`,
 *  `pt` is `BR`, `pa-Arab` is `PK`), or `null` where it names none. Every
 *  two-letter language is answered from a table, so an engine without
 *  `Intl.Locale` (Hermes, an older television) answers the same; a longer
 *  code is asked of `Intl.Locale` where there is one. */
export function likelyRegion(code: string): string | null {
  const [language = ''] = code.split('-');
  return table().get(code) ?? table().get(language) ?? fromIntl(code);
}
