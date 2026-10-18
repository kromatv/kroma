//! The rules editor's test box: what every profile makes of a release name.

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use kroma_module_sdk::host::{AuthUser, HostStorage};
use kroma_scene::{
    Candidate, Evaluation, Facts, Language, ParsedRelease, Query, Target, evaluate, judge,
};

use super::routes::{bad, require_reader, run};
use super::{RuleBook, load};
use crate::dtos::RefusalView;

pub(super) fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/acquisition/rules/test", axum::routing::post(test::<S>))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestBody {
    name: String,
    #[serde(default)]
    original: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfileVerdict {
    profile_id: String,
    profile_name: String,
    evaluation: Evaluation,
    refusal: Option<RefusalView>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TestView {
    facts: Facts,
    profiles: Vec<ProfileVerdict>,
}

/// `POST /acquisition/rules/test`: what the rules make of a release name.
async fn test<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<TestBody>,
) -> Result<Response, Response> {
    require_reader(&state, &user)?;
    if body.name.trim().is_empty() || body.name.len() > 512 {
        return Err(bad("give a release name of at most 512 characters"));
    }
    let view = run(move || {
        let book = load(&state)?;
        let original = body.original.as_deref().and_then(Language::parse);
        Ok(verdicts(&book, body.name.trim(), original.as_ref()))
    })
    .await?;
    Ok(Json(view).into_response())
}

fn verdicts(book: &RuleBook, name: &str, original: Option<&Language>) -> TestView {
    let parsed = kroma_scene::parse_release_name(name);
    let facts = Facts::from_release(name, &parsed, None);
    let query = Query {
        target: target_of(&parsed),
        runtime_minutes: None,
        original,
    };
    let profiles = book
        .profiles
        .iter()
        .map(|profile| {
            let rules = book.rules(profile);
            // A name says nothing about seeders or size, so neither refuses.
            let candidate = Candidate {
                size_bytes: None,
                seeders: Some(profile.min_seeders),
                indexer_priority: 0,
            };
            ProfileVerdict {
                profile_id: profile.id.clone(),
                profile_name: profile.name.clone(),
                evaluation: evaluate(&facts, original, &rules),
                refusal: judge(&parsed, &facts, &candidate, &query, &rules)
                    .as_ref()
                    .err()
                    .map(RefusalView::from),
            }
        })
        .collect();
    TestView { facts, profiles }
}

fn target_of(parsed: &ParsedRelease) -> Target {
    match (parsed.season, parsed.episode) {
        (Some(season), Some(episode)) if !parsed.full_season => Target::Episode { season, episode },
        (Some(season), _) => Target::Season {
            season,
            episodes: 1,
        },
        (None, _) => Target::Movie { year: parsed.year },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::legacy;
    use kroma_scene::{FormatSet, QualityProfile, default_formats, default_sizes};

    fn book(profile: QualityProfile) -> RuleBook {
        let formats = default_formats();
        RuleBook {
            compiled: FormatSet::compile(&formats).unwrap(),
            profiles: vec![profile],
            default_profile: "standard".into(),
            formats,
            sizes: default_sizes(&legacy()),
        }
    }

    fn standard() -> QualityProfile {
        QualityProfile::from_legacy("standard", "Standard", &legacy())
    }

    fn only(view: &TestView) -> &ProfileVerdict {
        &view.profiles[0]
    }

    #[test]
    fn a_release_every_rule_accepts_is_reported_with_its_score_and_no_refusal() {
        let book = book(standard());

        let view = verdicts(&book, "Show.S01E01.1080p.WEB-DL.x265-GRP", None);

        assert!(only(&view).refusal.is_none());
        assert!(only(&view).evaluation.quality_rank.is_some());
    }

    #[test]
    fn a_release_carrying_a_forbidden_term_says_which_rule_refused_it() {
        let mut strict = standard();
        strict.must_not_contain = vec!["CAM".into()];

        let view = verdicts(&book(strict), "Film.2020.1080p.CAM.x264-GRP", None);

        let refusal = only(&view).refusal.as_ref().expect("a refusal");
        assert_eq!(refusal.rule, "forbidden-keyword");
        assert_eq!(refusal.params["term"], "CAM");
    }

    #[test]
    fn a_release_below_the_minimum_format_score_says_so() {
        let mut demanding = standard();
        demanding.min_format_score = 100_000;

        let view = verdicts(&book(demanding), "Film.2020.1080p.WEB-DL.x265-GRP", None);

        assert_eq!(
            only(&view).refusal.as_ref().map(|r| r.rule.clone()),
            Some("format-score".to_string())
        );
    }

    #[test]
    fn a_quality_the_profile_does_not_allow_is_refused_by_name() {
        let view = verdicts(&book(standard()), "Film.2020.CAM.XviD-GRP", None);

        assert_eq!(
            only(&view).refusal.as_ref().map(|r| r.rule.clone()),
            Some("quality".to_string())
        );
    }

    #[test]
    fn a_profile_that_demands_seeders_does_not_refuse_a_bare_name_for_having_none() {
        let mut demanding = standard();
        demanding.min_seeders = 50;

        let view = verdicts(&book(demanding), "Show.S01E01.1080p.WEB-DL.x265-GRP", None);

        assert!(only(&view).refusal.is_none());
    }

    #[test]
    fn a_season_pack_is_judged_as_the_pack_it_says_it_is() {
        let view = verdicts(&book(standard()), "Show.S01.1080p.WEB-DL.x265-GRP", None);

        assert!(only(&view).refusal.is_none(), "{:?}", only(&view).refusal);
    }
}
