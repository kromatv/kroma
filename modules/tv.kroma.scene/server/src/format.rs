use std::collections::BTreeMap;

use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};

use crate::{AudioCodec, Codec, Facts, HdrFormat, IndexerFlag, Language, Res, Source};

/// A named test on a release or a file, built from conditions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFormat {
    pub id: String,
    pub name: String,
    pub conditions: Vec<Condition>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Condition {
    #[serde(default)]
    pub negate: bool,
    #[serde(default)]
    pub required: bool,
    #[serde(flatten)]
    pub spec: Spec,
}

/// What one condition tests. `language` takes a tag (`fr`, `fr-CA`) or
/// `original`, the title's own language.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Spec {
    ReleaseTitle {
        pattern: String,
    },
    ReleaseGroup {
        pattern: String,
    },
    Edition {
        pattern: String,
    },
    Language {
        value: String,
    },
    Subtitle {
        value: String,
    },
    Source {
        value: Source,
    },
    Resolution {
        value: Res,
    },
    VideoCodec {
        value: Codec,
    },
    Hdr {
        value: Option<HdrFormat>,
    },
    #[serde(rename_all = "camelCase")]
    Audio {
        codec: Option<AudioCodec>,
        min_channels: Option<u32>,
    },
    #[serde(rename_all = "camelCase")]
    Size {
        min_gb: Option<f64>,
        max_gb: Option<f64>,
    },
    IndexerFlag {
        value: IndexerFlag,
    },
}

impl Spec {
    fn kind(&self) -> &'static str {
        match self {
            Spec::ReleaseTitle { .. } => "releaseTitle",
            Spec::ReleaseGroup { .. } => "releaseGroup",
            Spec::Edition { .. } => "edition",
            Spec::Language { .. } => "language",
            Spec::Subtitle { .. } => "subtitle",
            Spec::Source { .. } => "source",
            Spec::Resolution { .. } => "resolution",
            Spec::VideoCodec { .. } => "videoCodec",
            Spec::Hdr { .. } => "hdr",
            Spec::Audio { .. } => "audio",
            Spec::Size { .. } => "size",
            Spec::IndexerFlag { .. } => "indexerFlag",
        }
    }
}

/// Why a format cannot be used as written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FormatError {
    pub format: String,
    pub reason: String,
}

const ORIGINAL: &str = "original";

/// A list of formats ready to match: patterns compiled once, so a pass judging
/// hundreds of releases does not recompile them per release.
#[derive(Debug)]
pub struct FormatSet {
    formats: Vec<Compiled>,
}

#[derive(Debug)]
struct Compiled {
    format: CustomFormat,
    conditions: Vec<CompiledCondition>,
}

#[derive(Debug)]
struct CompiledCondition {
    negate: bool,
    required: bool,
    kind: &'static str,
    test: Test,
}

#[derive(Debug)]
enum Test {
    Pattern(Field, Regex),
    Language(Option<Language>),
    Subtitle(Language),
    Spec(Spec),
}

#[derive(Debug, Clone, Copy)]
enum Field {
    Name,
    Group,
    Edition,
}

impl FormatSet {
    /// Compiles every format, refusing the first one that cannot be used.
    pub fn compile(formats: &[CustomFormat]) -> Result<Self, FormatError> {
        let formats = formats
            .iter()
            .map(compile_format)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self { formats })
    }

    /// Compiles what can be, skipping a format that cannot: a stored rule an
    /// admin broke must not stop every search.
    pub fn compile_lenient(formats: &[CustomFormat]) -> Self {
        Self {
            formats: formats
                .iter()
                .filter_map(|f| compile_format(f).ok())
                .collect(),
        }
    }

    /// The formats `facts` matches, in the order they were given.
    pub fn matching(&self, facts: &Facts, original: Option<&Language>) -> Vec<&CustomFormat> {
        self.formats
            .iter()
            .filter(|compiled| compiled.matches(facts, original))
            .map(|compiled| &compiled.format)
            .collect()
    }
}

fn compile_format(format: &CustomFormat) -> Result<Compiled, FormatError> {
    let error = |reason: String| FormatError {
        format: format.name.clone(),
        reason,
    };
    if format.conditions.is_empty() {
        return Err(error("a format needs at least one condition".into()));
    }
    let conditions = format
        .conditions
        .iter()
        .map(|condition| {
            Ok(CompiledCondition {
                negate: condition.negate,
                required: condition.required,
                kind: condition.spec.kind(),
                test: compile_test(&condition.spec).map_err(error)?,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Compiled {
        format: format.clone(),
        conditions,
    })
}

fn compile_test(spec: &Spec) -> Result<Test, String> {
    let pattern = |field: Field, pattern: &str| {
        RegexBuilder::new(pattern)
            .case_insensitive(true)
            .size_limit(1 << 20)
            .build()
            .map(|regex| Test::Pattern(field, regex))
            .map_err(|e| format!("invalid pattern {pattern:?}: {e}"))
    };
    match spec {
        Spec::ReleaseTitle { pattern: p } => pattern(Field::Name, p),
        Spec::ReleaseGroup { pattern: p } => pattern(Field::Group, p),
        Spec::Edition { pattern: p } => pattern(Field::Edition, p),
        Spec::Language { value } if value.eq_ignore_ascii_case(ORIGINAL) => {
            Ok(Test::Language(None))
        }
        Spec::Language { value } => Language::parse(value)
            .map(|lang| Test::Language(Some(lang)))
            .ok_or_else(|| format!("not a language: {value:?}")),
        Spec::Subtitle { value } => Language::parse(value)
            .map(Test::Subtitle)
            .ok_or_else(|| format!("not a language: {value:?}")),
        Spec::Size {
            min_gb: Some(min),
            max_gb: Some(max),
        } if min > max => Err(format!("size range {min} > {max}")),
        other => Ok(Test::Spec(other.clone())),
    }
}

impl Compiled {
    // A format matches when every required condition holds and, for each kind
    // of condition that has optional ones, at least one of those holds: the
    // rule Sonarr and Radarr use, kept so their formats read the same here.
    fn matches(&self, facts: &Facts, original: Option<&Language>) -> bool {
        let mut optional: BTreeMap<&'static str, bool> = BTreeMap::new();
        for condition in &self.conditions {
            let held = condition.test.holds(facts, original) != condition.negate;
            if condition.required {
                if !held {
                    return false;
                }
            } else {
                *optional.entry(condition.kind).or_default() |= held;
            }
        }
        optional.values().all(|held| *held)
    }
}

impl Test {
    fn holds(&self, facts: &Facts, original: Option<&Language>) -> bool {
        match self {
            Test::Pattern(field, regex) => field.of(facts).is_some_and(|text| regex.is_match(text)),
            Test::Language(None) => facts.languages.has_original(original),
            Test::Language(Some(wanted)) => facts.languages.has(wanted, original),
            Test::Subtitle(wanted) => facts.subtitles.iter().any(|lang| lang.satisfies(wanted)),
            Test::Spec(spec) => spec_holds(spec, facts),
        }
    }
}

impl Field {
    fn of(self, facts: &Facts) -> Option<&str> {
        match self {
            Field::Name => Some(facts.name.as_str()),
            Field::Group => facts.group.as_deref(),
            Field::Edition => facts.edition.as_deref(),
        }
    }
}

fn spec_holds(spec: &Spec, facts: &Facts) -> bool {
    match spec {
        Spec::Source { value } => facts.source == Some(*value),
        Spec::Resolution { value } => facts.resolution == Some(*value),
        Spec::VideoCodec { value } => facts.codec == Some(*value),
        Spec::Hdr { value: None } => !facts.hdr.is_empty(),
        Spec::Hdr {
            value: Some(format),
        } => facts.hdr.contains(format),
        Spec::Audio {
            codec,
            min_channels,
        } => facts.audio.iter().any(|track| {
            codec.is_none_or(|codec| track.codec == Some(codec))
                && min_channels.is_none_or(|min| track.channels.is_some_and(|c| c >= min))
        }),
        Spec::Size { min_gb, max_gb } => facts.size_bytes.is_some_and(|bytes| {
            let gb = bytes as f64 / 1_073_741_824.0;
            min_gb.is_none_or(|min| gb >= min) && max_gb.is_none_or(|max| gb <= max)
        }),
        Spec::IndexerFlag { value } => facts.flags.contains(value),
        Spec::ReleaseTitle { .. }
        | Spec::ReleaseGroup { .. }
        | Spec::Edition { .. }
        | Spec::Language { .. }
        | Spec::Subtitle { .. } => false,
    }
}
