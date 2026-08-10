//! On-device subtitle generation (Whisper transcription, LLM translation),
//! producing WebVTT cached under `<data>/subs/downloaded/` and recorded in the
//! DB. Both engines are blocking and report progress through a [`progress::Handle`].

mod translate;

pub mod progress;

use std::path::Path;

use crate::db::{self, DownloadedSub, Pool};
use crate::services::settings::Settings;

pub use progress::{GenRegistry, Handle};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GenMode {
    Transcribe,
    Translate,
}

impl GenMode {
    pub fn parse(s: &str) -> GenMode {
        match s {
            "translate" => GenMode::Translate,
            _ => GenMode::Transcribe,
        }
    }

    fn provider(self) -> &'static str {
        match self {
            GenMode::Transcribe => "whisper",
            GenMode::Translate => "translate",
        }
    }
}

/// Whisper model tier; maps to a multilingual candle model auto-downloaded on
/// first use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quality {
    Fast,
    Balanced,
    Accurate,
}

impl Quality {
    pub fn parse(s: &str) -> Quality {
        match s {
            "fast" => Quality::Fast,
            "accurate" => Quality::Accurate,
            _ => Quality::Balanced,
        }
    }

    // Multilingual variants only, so spoken-language forcing works for
    // non-English content.
    fn model(self) -> &'static str {
        match self {
            Quality::Fast => "openai/whisper-tiny",
            Quality::Balanced => "openai/whisper-base",
            Quality::Accurate => "openai/whisper-small",
        }
    }
}

/// A generation request, resolved server-side: the client never uploads audio or
/// subtitle text.
pub struct GenSpec {
    pub mode: GenMode,
    // Display label, e.g. "Français" - not a language code.
    pub target_lang: String,
    // Spoken language to force (name or code); `None` auto-detects.
    pub spoken_lang: Option<String>,
    pub quality: Quality,
    // Audio-relative track index.
    pub audio_track: u32,
    pub source_vtt: Option<String>,
}

/// Run a generation to completion, caching and recording the WebVTT. `Err` carries
/// why it failed so the caller can show it instead of a blank "generation failed".
/// Blocking - call off the async runtime.
#[allow(clippy::too_many_arguments)]
pub fn generate(
    settings: &Settings,
    data_dir: &Path,
    pool: &Pool,
    item_id: &str,
    input: &Path,
    spec: &GenSpec,
    handle: &Handle,
    whisper: &dyn crate::ports::Whisper,
) -> std::result::Result<DownloadedSub, String> {
    let vtt = match spec.mode {
        GenMode::Transcribe => {
            let code = spec.spoken_lang.as_deref().and_then(lang_to_code);
            let cancel = handle.cancel_flag();
            whisper
                .transcribe(
                    data_dir,
                    spec.quality.model(),
                    input,
                    spec.audio_track,
                    code,
                    &|stage| handle.stage(stage),
                    &|done, total| handle.progress(done, total),
                    &cancel,
                )
                .ok_or_else(|| {
                    "transcription produced no text (wrong audio track, or the Whisper model failed to load; see server logs)".to_string()
                })?
        }
        GenMode::Translate => {
            handle.stage("translate");
            let src = spec
                .source_vtt
                .as_deref()
                .ok_or_else(|| "no source subtitle track to translate from".to_string())?;
            translate::translate_vtt(settings, src, &spec.target_lang, handle)?
        }
    };
    if vtt.len() < 16 {
        return Err("the generated subtitle came out empty".to_string());
    }

    let provider = spec.mode.provider();
    let id = stable_id(item_id, provider, &spec.target_lang);
    let dir = data_dir.join("subs").join("downloaded");
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create the subtitle cache dir: {e}"))?;
    let path = dir.join(format!("{id}.vtt"));
    std::fs::write(&path, vtt.as_bytes()).map_err(|e| format!("could not write the subtitle file: {e}"))?;

    let sub = DownloadedSub {
        id,
        item_id: item_id.to_string(),
        // The ISO code, or `None` - never the display label, which is not a
        // valid language code.
        language: lang_to_code(&spec.target_lang).map(str::to_string),
        label: spec.target_lang.clone(),
        provider: provider.to_string(),
        path: path.to_string_lossy().into_owned(),
    };
    db::insert_downloaded_sub(pool, &sub).map_err(|e| format!("could not record the subtitle in the database: {e}"))?;
    Ok(sub)
}

// Deterministic, so re-generating the same language replaces rather than duplicates.
fn stable_id(item_id: &str, provider: &str, target_lang: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    item_id.hash(&mut h);
    provider.hash(&mut h);
    target_lang.to_lowercase().hash(&mut h);
    format!("dl{:016x}", h.finish())
}

/// Normalize text to WebVTT (SRT timestamps `,`→`.` + header); a body already
/// starting with `WEBVTT` is passed through.
pub fn to_vtt(raw: &str) -> String {
    let text = raw.trim_start_matches('\u{feff}');
    if text.trim_start().starts_with("WEBVTT") {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len() + 16);
    out.push_str("WEBVTT\n\n");
    for line in text.lines() {
        if line.contains("-->") {
            out.push_str(&line.replace(',', "."));
        } else {
            out.push_str(line);
        }
        out.push('\n');
    }
    out
}

// `None` when unrecognized, which makes Whisper auto-detect.
fn lang_to_code(input: &str) -> Option<&'static str> {
    let s = input.trim().to_lowercase();
    let code = match s.as_str() {
        "fr" | "french" | "français" | "francais" => "fr",
        "en" | "english" | "anglais" => "en",
        "es" | "spanish" | "espagnol" | "español" | "espanol" => "es",
        "de" | "german" | "allemand" | "deutsch" => "de",
        "it" | "italian" | "italien" | "italiano" => "it",
        "pt" | "portuguese" | "portugais" | "português" | "portugues" => "pt",
        "nl" | "dutch" | "néerlandais" | "neerlandais" => "nl",
        "ja" | "japanese" | "japonais" => "ja",
        "ko" | "korean" | "coréen" | "coreen" => "ko",
        "zh" | "chinese" | "chinois" => "zh",
        "ru" | "russian" | "russe" => "ru",
        "ar" | "arabic" | "arabe" => "ar",
        "hi" | "hindi" => "hi",
        "pl" | "polish" | "polonais" => "pl",
        "tr" | "turkish" | "turc" => "tr",
        "sv" | "swedish" | "suédois" | "suedois" => "sv",
        _ => return None,
    };
    Some(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn srt_becomes_vtt() {
        let srt = "1\n00:00:01,000 --> 00:00:04,000\nHello\n";
        let vtt = to_vtt(srt);
        assert!(vtt.starts_with("WEBVTT"));
        assert!(vtt.contains("00:00:01.000 --> 00:00:04.000"));
        assert!(vtt.contains("Hello"));
    }

    #[test]
    fn vtt_passthrough() {
        let vtt_in = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n";
        assert_eq!(to_vtt(vtt_in).trim(), vtt_in.trim());
    }

    #[test]
    fn stable_id_is_deterministic_and_case_insensitive() {
        assert_eq!(stable_id("a", "whisper", "French"), stable_id("a", "whisper", "french"));
        assert_ne!(stable_id("a", "whisper", "French"), stable_id("a", "whisper", "English"));
    }

    #[test]
    fn lang_codes() {
        assert_eq!(lang_to_code("Français"), Some("fr"));
        assert_eq!(lang_to_code("english"), Some("en"));
        assert_eq!(lang_to_code("es"), Some("es"));
        assert_eq!(lang_to_code("Klingon"), None);
    }

    #[test]
    fn lang_codes_cover_many_names_and_codes() {
        assert_eq!(lang_to_code("  DEUTSCH "), Some("de"));
        assert_eq!(lang_to_code("italiano"), Some("it"));
        assert_eq!(lang_to_code("Japonais"), Some("ja"));
        assert_eq!(lang_to_code("zh"), Some("zh"));
        assert_eq!(lang_to_code("russe"), Some("ru"));
        assert_eq!(lang_to_code("português"), Some("pt"));
        assert_eq!(lang_to_code(""), None);
    }

    #[test]
    fn gen_mode_parse_and_provider() {
        assert_eq!(GenMode::parse("translate"), GenMode::Translate);
        assert_eq!(GenMode::parse("transcribe"), GenMode::Transcribe);
        assert_eq!(GenMode::parse("anything-else"), GenMode::Transcribe);
        assert_eq!(GenMode::Transcribe.provider(), "whisper");
        assert_eq!(GenMode::Translate.provider(), "translate");
    }

    #[test]
    fn quality_parse_and_model() {
        assert_eq!(Quality::parse("fast"), Quality::Fast);
        assert_eq!(Quality::parse("accurate"), Quality::Accurate);
        assert_eq!(Quality::parse("balanced"), Quality::Balanced);
        assert_eq!(Quality::parse("bogus"), Quality::Balanced);
        assert_eq!(Quality::Fast.model(), "openai/whisper-tiny");
        assert_eq!(Quality::Balanced.model(), "openai/whisper-base");
        assert_eq!(Quality::Accurate.model(), "openai/whisper-small");
    }

    #[test]
    fn to_vtt_strips_bom_and_converts_srt_commas() {
        let srt = "\u{feff}1\n00:00:01,000 --> 00:00:04,000\nLine one\nLine two\n";
        let vtt = to_vtt(srt);
        assert!(vtt.starts_with("WEBVTT"));
        assert!(vtt.contains("00:00:01.000 --> 00:00:04.000"));
        assert!(vtt.contains("Line one"));
        assert!(vtt.contains("Line two"));
    }

    #[test]
    fn to_vtt_passthrough_after_bom() {
        let with_bom = "\u{feff}WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n";
        assert_eq!(to_vtt(with_bom), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n");
    }

    #[test]
    fn stable_id_distinguishes_item_and_provider() {
        assert_ne!(stable_id("a", "whisper", "French"), stable_id("b", "whisper", "French"));
        assert_ne!(stable_id("a", "whisper", "French"), stable_id("a", "translate", "French"));
        assert!(stable_id("a", "whisper", "French").starts_with("dl"));
    }

    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    use crate::services::subtitles::progress::GenRegistry;
    use crate::test_support::FakeLlm;

    struct FakeWhisper {
        output: Option<String>,
        asked: std::sync::Mutex<Vec<(String, u32, Option<String>)>>,
    }

    impl FakeWhisper {
        fn saying(text: Option<&str>) -> Self {
            Self {
                output: text.map(str::to_string),
                asked: std::sync::Mutex::new(Vec::new()),
            }
        }
    }

    impl crate::ports::Whisper for FakeWhisper {
        fn transcribe(
            &self,
            _data_dir: &Path,
            model_spec: &str,
            _input: &Path,
            track: u32,
            lang: Option<&str>,
            on_stage: &dyn Fn(&str),
            on_progress: &dyn Fn(usize, usize),
            _cancel: &AtomicBool,
        ) -> Option<String> {
            self.asked.lock().unwrap().push((
                model_spec.to_string(),
                track,
                lang.map(str::to_string),
            ));
            on_stage("transcribe");
            on_progress(1, 1);
            self.output.clone()
        }
    }

    struct Env {
        dir: kroma_testing::TempDir,
        pool: Pool,
        settings: Settings,
    }

    fn env() -> Env {
        let dir = kroma_testing::temp_dir("subgen");
        let pool = crate::db::init(&dir.path().join("kroma.db")).unwrap();
        // `downloaded_subtitles.item_id` is a foreign key, so there must be a real item.
        {
            let conn = pool.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) \
                 VALUES ('itm-1','movie','Title','mkv','lib','t')",
                [],
            )
            .unwrap();
        }
        let settings = Settings::load(&pool);
        Env { dir, pool, settings }
    }

    fn handle() -> Handle {
        Arc::new(GenRegistry::default()).start("itm-1", "gen", Some("fr".into()))
    }

    const SOURCE_VTT: &str = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello there\n\n";

    fn spec(mode: GenMode, target: &str) -> GenSpec {
        GenSpec {
            mode,
            target_lang: target.to_string(),
            spoken_lang: Some("English".into()),
            quality: Quality::Balanced,
            audio_track: 2,
            source_vtt: matches!(mode, GenMode::Translate).then(|| SOURCE_VTT.to_string()),
        }
    }

    fn run(env: &Env, spec: &GenSpec, whisper: &dyn crate::ports::Whisper) -> Result<DownloadedSub, String> {
        generate(
            &env.settings,
            env.dir.path(),
            &env.pool,
            "itm-1",
            Path::new("/media/itm-1.mkv"),
            spec,
            &handle(),
            whisper,
        )
    }

    #[test]
    fn a_translation_is_written_to_disk_and_recorded() {
        let env = env();
        let llm = FakeLlm::always("1. Bonjour à tous\n");
        llm.configure_settings(&env.settings, &env.pool);

        let sub = run(&env, &spec(GenMode::Translate, "Français"), &FakeWhisper::saying(None)).unwrap();
        assert_eq!(sub.item_id, "itm-1");
        assert_eq!(sub.language.as_deref(), Some("fr"));
        assert_eq!(sub.label, "Français");
        let written = std::fs::read_to_string(&sub.path).unwrap();
        assert!(written.contains("Bonjour"), "{written}");
        let rows = crate::db::downloaded_subs_for_item(&env.pool.get().unwrap(), "itm-1").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, sub.id);
    }

    #[test]
    fn regenerating_the_same_language_replaces_rather_than_duplicates() {
        let env = env();
        let llm = FakeLlm::always("1. Bonjour\n");
        llm.configure_settings(&env.settings, &env.pool);

        let first = run(&env, &spec(GenMode::Translate, "Français"), &FakeWhisper::saying(None)).unwrap();
        let second = run(&env, &spec(GenMode::Translate, "Français"), &FakeWhisper::saying(None)).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(crate::db::downloaded_subs_for_item(&env.pool.get().unwrap(), "itm-1").unwrap().len(), 1);

        let other = run(&env, &spec(GenMode::Translate, "Deutsch"), &FakeWhisper::saying(None)).unwrap();
        assert_ne!(other.id, first.id);
        assert_eq!(crate::db::downloaded_subs_for_item(&env.pool.get().unwrap(), "itm-1").unwrap().len(), 2);
    }

    #[test]
    fn a_target_language_we_cannot_map_keeps_its_label_without_inventing_a_code() {
        let env = env();
        let llm = FakeLlm::always("1. Something\n");
        llm.configure_settings(&env.settings, &env.pool);

        let sub = run(&env, &spec(GenMode::Translate, "Klingon"), &FakeWhisper::saying(None)).unwrap();
        assert_eq!(sub.language, None, "an unknown label must not become a code");
        assert_eq!(sub.label, "Klingon");
    }

    #[test]
    fn translating_with_nothing_to_translate_from_says_so() {
        let env = env();
        let mut spec = spec(GenMode::Translate, "Français");
        spec.source_vtt = None;
        let err = run(&env, &spec, &FakeWhisper::saying(None)).unwrap_err();
        assert!(err.contains("no source subtitle"), "{err}");
    }

    #[test]
    fn a_transcription_uses_the_requested_model_track_and_language() {
        let env = env();
        let whisper = FakeWhisper::saying(Some(
            "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello there\n\n",
        ));
        let sub = run(&env, &spec(GenMode::Transcribe, "English"), &whisper).unwrap();
        assert_eq!(sub.language.as_deref(), Some("en"));

        let asked = whisper.asked.lock().unwrap();
        assert_eq!(asked.len(), 1);
        assert_eq!(asked[0].0, Quality::Balanced.model());
        assert_eq!(asked[0].1, 2, "the audio track index was not passed through");
        assert_eq!(asked[0].2.as_deref(), Some("en"), "the spoken language is sent as a CODE");
    }

    #[test]
    fn a_whisper_that_produced_nothing_explains_the_usual_causes() {
        let env = env();
        let err = run(&env, &spec(GenMode::Transcribe, "English"), &FakeWhisper::saying(None))
            .unwrap_err();
        assert!(err.contains("audio track"), "{err}");
        assert!(err.contains("model"), "{err}");
    }

    #[test]
    fn a_result_too_short_to_be_a_subtitle_is_refused() {
        let env = env();
        let err = run(&env, &spec(GenMode::Transcribe, "English"), &FakeWhisper::saying(Some("WEBVTT")))
            .unwrap_err();
        assert!(err.contains("empty"), "{err}");
        assert!(crate::db::downloaded_subs_for_item(&env.pool.get().unwrap(), "itm-1").unwrap().is_empty());
    }

    #[test]
    fn a_failing_translation_surfaces_the_reason_rather_than_a_blank_failure() {
        let env = env();
        let err = run(&env, &spec(GenMode::Translate, "Français"), &FakeWhisper::saying(None))
            .unwrap_err();
        assert!(err.contains("admin"), "{err}");
        assert!(crate::db::downloaded_subs_for_item(&env.pool.get().unwrap(), "itm-1").unwrap().is_empty());
    }
}
