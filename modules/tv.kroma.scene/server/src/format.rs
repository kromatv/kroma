use std::collections::BTreeMap;

use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};

use crate::condition::spec_holds;
use crate::{Condition, Facts, Language, Spec};

/// A named test on a release or a file, built from conditions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFormat {
    pub id: String,
    pub name: String,
    pub conditions: Vec<Condition>,
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
        Spec::Year {
            min: Some(min),
            max: Some(max),
        } if min > max => Err(format!("year range {min} > {max}")),
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
