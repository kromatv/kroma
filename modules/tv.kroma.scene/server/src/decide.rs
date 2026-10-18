use std::cmp::Ordering;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::shape::{check_shape, reject};
use crate::terms::check_terms;
use crate::{
    Candidate, Facts, FormatSet, Language, Params, ParsedRelease, Quality, QualityProfile, Reject,
    ScoreLine, Sizes, Target,
};

/// The rules one decision is made under.
#[derive(Debug, Clone, Copy)]
pub struct Rules<'a> {
    pub profile: &'a QualityProfile,
    pub formats: &'a FormatSet,
    pub sizes: &'a Sizes,
}

/// What a release is asked to fill. `runtime_minutes` is one episode's (or the
/// film's) when the metadata knows it, and `original` the title's own language.
#[derive(Debug, Clone, Copy)]
pub struct Query<'a> {
    pub target: Target,
    pub runtime_minutes: Option<u32>,
    pub original: Option<&'a Language>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedFormat {
    pub id: String,
    pub name: String,
    pub score: i32,
}

/// How a profile sees one release or one file. `quality_rank` is `None` when
/// the profile does not allow its quality.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Evaluation {
    pub quality: Quality,
    pub quality_rank: Option<u32>,
    pub formats: Vec<MatchedFormat>,
    pub format_score: i32,
    pub revision: u32,
}

/// A release that passed every rule, with what ranks it against the others.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Judged {
    pub evaluation: Evaluation,
    pub seeders: u32,
    pub indexer_priority: i32,
    pub episode_count: u32,
    pub size_bytes: Option<u64>,
    pub preferred_bytes: Option<u64>,
    pub breakdown: Vec<ScoreLine>,
}

impl Judged {
    pub fn score(&self) -> i32 {
        self.evaluation.format_score
    }
}

pub fn evaluate(facts: &Facts, original: Option<&Language>, rules: &Rules) -> Evaluation {
    let quality = facts.quality();
    let formats: Vec<MatchedFormat> = rules
        .formats
        .matching(facts, original)
        .into_iter()
        .map(|format| MatchedFormat {
            id: format.id.clone(),
            name: format.name.clone(),
            score: rules.profile.score_of(&format.id),
        })
        .collect();
    Evaluation {
        quality,
        quality_rank: rules.profile.rank(quality),
        format_score: formats.iter().map(|format| format.score).sum(),
        formats,
        revision: facts.revision,
    }
}

/// Refuses a release with the first rule it breaks, or says how it ranks.
pub fn judge(
    parsed: &ParsedRelease,
    facts: &Facts,
    candidate: &Candidate,
    query: &Query,
    rules: &Rules,
) -> Result<Judged, Reject> {
    let profile = rules.profile;
    check_shape(parsed, &query.target)?;
    check_terms(profile, &facts.name)?;
    let evaluation = evaluate(facts, query.original, rules);
    if evaluation.quality_rank.is_none() {
        return Err(reject(
            "quality",
            format!("{} is not allowed", evaluation.quality.id()),
            [("quality", json!(evaluation.quality.id()))],
        ));
    }
    if evaluation.format_score < profile.min_format_score {
        return Err(reject(
            "format-score",
            format!("{} < {}", evaluation.format_score, profile.min_format_score),
            [
                ("have", json!(evaluation.format_score)),
                ("need", json!(profile.min_format_score)),
            ],
        ));
    }
    let seeders = candidate.seeders.unwrap_or(0);
    if seeders < profile.min_seeders {
        return Err(reject(
            "seeders",
            format!("{seeders} < {}", profile.min_seeders),
            [
                ("have", json!(seeders)),
                ("need", json!(profile.min_seeders)),
            ],
        ));
    }
    let episode_count = query.target.episode_count();
    let preferred_bytes = check_size(candidate.size_bytes, evaluation.quality, query, rules)?;
    let breakdown = breakdown(&evaluation, episode_count);
    Ok(Judged {
        evaluation,
        seeders,
        indexer_priority: candidate.indexer_priority,
        episode_count,
        size_bytes: candidate.size_bytes,
        preferred_bytes,
        breakdown,
    })
}

const MB: f64 = 1_048_576.0;

fn check_size(
    size_bytes: Option<u64>,
    quality: Quality,
    query: &Query,
    rules: &Rules,
) -> Result<Option<u64>, Reject> {
    let movie = matches!(query.target, Target::Movie { .. });
    let Some(limit) = rules.sizes.limit(quality, movie) else {
        return Ok(None);
    };
    let fallback = if movie {
        rules.sizes.movie_runtime
    } else {
        rules.sizes.episode_runtime
    };
    let minutes =
        f64::from(query.runtime_minutes.unwrap_or(fallback).max(1) * query.target.episode_count());
    let preferred = limit
        .preferred
        .map(|per_minute| (per_minute * minutes * MB) as u64);
    let Some(size) = size_bytes else {
        return Ok(preferred);
    };
    let per_minute = size as f64 / MB / minutes;
    if per_minute < limit.min {
        let floor = (limit.min * minutes * MB) as u64;
        return Err(reject(
            "too-small",
            format!("{} < {}", gb(size), gb(floor)),
            size_params(size, floor),
        ));
    }
    if let Some(max) = limit.max.filter(|max| per_minute > *max) {
        let ceiling = (max * minutes * MB) as u64;
        return Err(reject(
            "too-big",
            format!("{} > {}", gb(size), gb(ceiling)),
            size_params(size, ceiling),
        ));
    }
    Ok(preferred)
}

fn size_params(size: u64, limit: u64) -> [(&'static str, Value); 2] {
    [("sizeBytes", json!(size)), ("limitBytes", json!(limit))]
}

fn gb(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
}

fn line(rule: &str, delta: i32, note: String, params: [(&'static str, Value); 1]) -> ScoreLine {
    ScoreLine {
        rule: rule.into(),
        delta,
        note,
        params: params
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect::<Params>(),
    }
}

fn breakdown(evaluation: &Evaluation, episode_count: u32) -> Vec<ScoreLine> {
    let quality = evaluation.quality.id();
    let mut lines = vec![line(
        "quality",
        evaluation.quality_rank.unwrap_or(0) as i32,
        quality.into(),
        [("quality", json!(quality))],
    )];
    lines.extend(evaluation.formats.iter().map(|format| {
        line(
            "format",
            format.score,
            format.name.clone(),
            [("format", json!(format.name))],
        )
    }));
    if evaluation.revision > 1 {
        lines.push(line(
            "revision",
            (evaluation.revision - 1) as i32,
            format!("v{}", evaluation.revision),
            [("revision", json!(evaluation.revision))],
        ));
    }
    if episode_count > 1 {
        lines.push(line(
            "season-pack",
            episode_count as i32,
            format!("{episode_count} episodes"),
            [("episodes", json!(episode_count))],
        ));
    }
    lines
}

/// Orders two releases, `Greater` meaning `a` is the better one: quality, then
/// format score, revision, how many episodes one grab covers, the indexer's
/// priority, seeders, and how close the size is to the preferred one.
pub fn rank(a: &Judged, b: &Judged) -> Ordering {
    let (ea, eb) = (&a.evaluation, &b.evaluation);
    ea.quality_rank
        .cmp(&eb.quality_rank)
        .then(ea.format_score.cmp(&eb.format_score))
        .then(ea.revision.cmp(&eb.revision))
        .then(a.episode_count.cmp(&b.episode_count))
        .then(a.indexer_priority.cmp(&b.indexer_priority))
        .then(seeder_bucket(a.seeders).cmp(&seeder_bucket(b.seeders)))
        .then(size_distance(b).cmp(&size_distance(a)))
        .then(a.seeders.cmp(&b.seeders))
}

fn seeder_bucket(seeders: u32) -> u8 {
    match seeders {
        0 => 0,
        1..=4 => 1,
        5..=19 => 2,
        20..=49 => 3,
        _ => 4,
    }
}

fn size_distance(judged: &Judged) -> u64 {
    match (judged.size_bytes, judged.preferred_bytes) {
        (Some(size), Some(preferred)) => size.abs_diff(preferred),
        (Some(size), None) => u64::MAX - size,
        (None, _) => u64::MAX,
    }
}
