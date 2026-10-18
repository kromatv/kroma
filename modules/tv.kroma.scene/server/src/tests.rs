use crate::*;

mod conditions;
mod formats;
mod judge;
mod languages;
mod parse;
mod rank;
mod refusals;
mod tags;
mod upgrades;

const GB: u64 = 1_073_741_824;

fn p(name: &str) -> ParsedRelease {
    parse_release_name(name)
}

fn legacy() -> LegacySettings {
    LegacySettings {
        resolution: Res::R1080,
        prefer_hevc: true,
        min_seeders: 2,
        max_gb_movie: 15,
        max_gb_episode: 3,
        required_keywords: vec![],
        forbidden_keywords: vec!["cam".into(), "hdcam".into(), "screener".into()],
    }
}

struct Fixture {
    profile: QualityProfile,
    formats: FormatSet,
    sizes: Sizes,
}

fn fixture_with(legacy: LegacySettings) -> Fixture {
    Fixture {
        profile: QualityProfile::from_legacy("default", "Default", &legacy),
        formats: FormatSet::compile(&default_formats()).unwrap(),
        sizes: default_sizes(&legacy),
    }
}

fn fixture() -> Fixture {
    fixture_with(legacy())
}

fn movie() -> Target {
    Target::Movie { year: Some(2020) }
}

fn english() -> Language {
    Language::new("en", None)
}

impl Fixture {
    fn rules(&self) -> Rules<'_> {
        Rules {
            profile: &self.profile,
            formats: &self.formats,
            sizes: &self.sizes,
        }
    }

    fn judge_with(
        &self,
        name: &str,
        candidate: Candidate,
        target: Target,
    ) -> Result<Judged, Reject> {
        let parsed = p(name);
        let facts = Facts::from_release(name, &parsed, candidate.size_bytes);
        let original = english();
        let query = Query {
            target,
            runtime_minutes: None,
            original: Some(&original),
        };
        judge(&parsed, &facts, &candidate, &query, &self.rules())
    }

    fn judge(
        &self,
        name: &str,
        size_gb: u64,
        seeders: u32,
        target: Target,
    ) -> Result<Judged, Reject> {
        self.judge_with(name, cand(size_gb, seeders), target)
    }

    fn evaluate(&self, name: &str) -> Evaluation {
        let facts = Facts::from_release(name, &p(name), None);
        evaluate(&facts, Some(&english()), &self.rules())
    }
}

fn names(set: &FormatSet, name: &str, original: Option<&Language>) -> Vec<String> {
    let facts = Facts::from_release(name, &p(name), Some(4 * GB));
    set.matching(&facts, original)
        .into_iter()
        .map(|format| format.id.clone())
        .collect()
}

fn defaults() -> FormatSet {
    FormatSet::compile(&default_formats()).unwrap()
}

fn spec(spec: Spec) -> Condition {
    Condition {
        negate: false,
        required: false,
        spec,
    }
}

fn single(spec: Spec) -> FormatSet {
    FormatSet::compile(&[CustomFormat {
        id: "x".into(),
        name: "X".into(),
        conditions: vec![self::spec(spec)],
    }])
    .unwrap()
}

fn cand(size_gb: u64, seeders: u32) -> Candidate {
    Candidate {
        size_bytes: Some(size_gb * GB),
        seeders: Some(seeders),
        indexer_priority: 0,
    }
}
