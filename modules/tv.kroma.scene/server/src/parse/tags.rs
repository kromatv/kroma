use crate::{AudioCodec, Language, ParsedRelease};

const AUDIO_LANGUAGES: &[(&str, &[&str])] = &[
    ("fr-FR", &["truefrench", "vff", "vof", "vfi"]),
    ("fr-CA", &["vfq", "vq", "quebec", "québec"]),
    ("fr", &["french", "vf"]),
    ("en", &["english", "eng"]),
    ("de", &["german", "ger", "deutsch"]),
    ("es", &["spanish", "spa", "esp", "castellano"]),
    ("it", &["italian", "ita"]),
    ("ja", &["japanese", "jpn", "jap"]),
    ("ko", &["korean", "kor"]),
    ("ru", &["russian", "rus"]),
    ("nl", &["dutch"]),
    ("pt", &["portuguese", "por"]),
    ("zh", &["chinese", "mandarin"]),
    ("hi", &["hindi"]),
];

const FRENCH_SUBTITLES: &[&str] = &["vostfr", "subfrench", "stfr", "vost"];

const EDITIONS: &[(&str, &str)] = &[
    ("extended", "Extended"),
    ("unrated", "Unrated"),
    ("uncut", "Uncut"),
    ("remastered", "Remastered"),
    ("imax", "IMAX"),
    ("theatrical", "Theatrical"),
    ("criterion", "Criterion"),
];

/// Reads what the tokens after the title say about languages, the cut and
/// the audio. Only the tail is read, so `The.French.Dispatch` stays a title.
pub(super) fn read_tags(out: &mut ParsedRelease, tail: &[String]) {
    let lowered: Vec<String> = tail.iter().map(|t| t.to_lowercase()).collect();
    let mut editions: Vec<&str> = Vec::new();
    for (i, token) in lowered.iter().enumerate() {
        let next = lowered.get(i + 1).map(String::as_str);
        read_language(out, token);
        if let Some(edition) = edition_at(token, next) {
            if !editions.contains(&edition) {
                editions.push(edition);
            }
        }
        if out.audio_codec.is_none() {
            read_audio(out, &lowered[i..]);
        }
    }
    if !editions.is_empty() {
        out.edition = Some(editions.join(" "));
    }
}

fn read_language(out: &mut ParsedRelease, token: &str) {
    if is_multi(token) {
        out.multi = true;
        if is_french_multi(token) {
            push_language(&mut out.languages, "fr");
        }
        return;
    }
    if token == "vf2" {
        push_language(&mut out.languages, "fr-FR");
        push_language(&mut out.languages, "fr-CA");
        return;
    }
    if FRENCH_SUBTITLES.contains(&token) {
        push_language(&mut out.subtitles, "fr");
        return;
    }
    if let Some((tag, _)) = AUDIO_LANGUAGES
        .iter()
        .find(|(_, words)| words.contains(&token))
    {
        push_language(&mut out.languages, tag);
    }
}

fn is_multi(token: &str) -> bool {
    matches!(token, "dual" | "dualaudio") || is_french_multi(token)
}

fn is_french_multi(token: &str) -> bool {
    token
        .strip_prefix("multi")
        .is_some_and(|rest| rest.chars().all(|c| c.is_ascii_digit()))
}

fn push_language(languages: &mut Vec<Language>, tag: &str) {
    let Some(language) = Language::parse(tag) else {
        return;
    };
    let vague = Language::new(&language.code, None);
    if language.region.is_some() {
        languages.retain(|held| held != &vague);
    } else if languages.iter().any(|held| held.code == language.code) {
        return;
    }
    if !languages.contains(&language) {
        languages.push(language);
    }
}

fn edition_at(token: &str, next: Option<&str>) -> Option<&'static str> {
    match (token, next) {
        ("directors" | "director's" | "dc", Some("cut")) => Some("Director's Cut"),
        ("final", Some("cut")) => Some("Final Cut"),
        _ => EDITIONS
            .iter()
            .find(|(word, _)| *word == token)
            .map(|(_, label)| *label),
    }
}

fn read_audio(out: &mut ParsedRelease, from: &[String]) {
    let token = from[0].as_str();
    let next = from.get(1).map(String::as_str);
    let (codec, digits) = match exact_codec(token, next) {
        Some(codec) => (codec, ""),
        None => {
            let (word, digits) = split_digits(token);
            let Some(codec) = word_codec(word) else {
                return;
            };
            (codec, digits)
        }
    };
    out.audio_codec = Some(codec);
    out.audio_channels = channels(digits, &from[1..]);
}

fn split_digits(token: &str) -> (&str, &str) {
    let at = token
        .find(|c: char| c.is_ascii_digit())
        .unwrap_or(token.len());
    token.split_at(at)
}

fn exact_codec(token: &str, next: Option<&str>) -> Option<AudioCodec> {
    match token {
        "eac3" | "e-ac-3" => Some(AudioCodec::Eac3),
        "ac3" | "ac-3" => Some(AudioCodec::Ac3),
        "dts-x" | "dtsx" => Some(AudioCodec::DtsX),
        "dts-hd" | "dtshd" if next == Some("ma") => Some(AudioCodec::DtsHdMa),
        "dts-hdma" | "dtshdma" => Some(AudioCodec::DtsHdMa),
        "dts-hd" | "dtshd" => Some(AudioCodec::DtsHd),
        _ => None,
    }
}

fn word_codec(word: &str) -> Option<AudioCodec> {
    match word {
        "truehd" => Some(AudioCodec::TrueHd),
        "dts" => Some(AudioCodec::Dts),
        "ddp" | "dd+" => Some(AudioCodec::Eac3),
        "dd" => Some(AudioCodec::Ac3),
        "aac" => Some(AudioCodec::Aac),
        "flac" => Some(AudioCodec::Flac),
        "opus" => Some(AudioCodec::Opus),
        "lpcm" | "pcm" => Some(AudioCodec::Pcm),
        "mp3" => Some(AudioCodec::Mp3),
        _ => None,
    }
}

fn channels(digits: &str, rest: &[String]) -> Option<u32> {
    let rest: Vec<&str> = rest
        .iter()
        .map(String::as_str)
        .skip_while(|t| *t == "ma")
        .take(2)
        .collect();
    let (main, lfe) = match (digits, rest.as_slice()) {
        ("", [main, lfe, ..]) => (*main, *lfe),
        (main, [lfe, ..]) if !main.is_empty() => (main, *lfe),
        _ => return None,
    };
    let main: u32 = main.parse().ok().filter(|n| (1..=7).contains(n))?;
    match lfe {
        "0" => Some(main),
        "1" => Some(main + 1),
        _ => None,
    }
}
