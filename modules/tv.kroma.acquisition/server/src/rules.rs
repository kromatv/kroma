//! The quality rules an admin writes: profiles, custom formats and size limits,
//! kept in this module's own database and judged by `kroma_scene`. The first
//! read on a server seeds them from the settings that came before profiles.

use anyhow::Result;
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::{
    CustomFormat, FormatSet, Language, LegacySettings, QualityProfile, Res, Rules, Sizes,
    default_formats, default_sizes,
};

pub mod blocklist;
pub mod file_facts;
pub mod files;
mod judgement;
pub mod routes;
pub mod schema;
pub mod store;

#[cfg(test)]
mod tests;

pub const DEFAULT_PROFILE_ID: &str = "standard";
const DEFAULT_PROFILE_NAME: &str = "Standard";

/// Every rule, read once for a pass, with the formats ready to match.
pub struct RuleBook {
    pub profiles: Vec<QualityProfile>,
    pub default_profile: String,
    pub formats: Vec<CustomFormat>,
    pub sizes: Sizes,
    compiled: FormatSet,
}

impl RuleBook {
    /// The profile `id` names, else the default one, else the first.
    pub fn profile(&self, id: Option<&str>) -> &QualityProfile {
        let find = |wanted: &str| self.profiles.iter().find(|p| p.id == wanted);
        id.and_then(find)
            .or_else(|| find(&self.default_profile))
            .or_else(|| self.profiles.first())
            .expect("a rule book always holds a profile")
    }

    pub fn rules<'a>(&'a self, profile: &'a QualityProfile) -> Rules<'a> {
        Rules {
            profile,
            formats: &self.compiled,
            sizes: &self.sizes,
        }
    }

    /// The profile a title is judged by.
    pub fn profile_for<S: HostStorage>(
        &self,
        state: &S,
        kind: RequestKind,
        tmdb_id: u64,
    ) -> Result<&QualityProfile> {
        let chosen = store::title_profile(state.store(), kind, tmdb_id)?;
        Ok(self.profile(chosen.as_deref()))
    }
}

/// Reads every rule, seeding the defaults the first time.
pub fn load<S: HostStorage>(state: &S) -> Result<RuleBook> {
    if store::setting(state.store(), store::SEEDED)?.is_none() {
        seed(state)?;
    }
    let mut profiles = store::profiles(state.store())?;
    if profiles.is_empty() {
        profiles.push(QualityProfile::from_legacy(
            DEFAULT_PROFILE_ID,
            DEFAULT_PROFILE_NAME,
            &legacy(state),
        ));
    }
    let formats = store::formats(state.store())?;
    let sizes = match store::sizes(state.store())? {
        Some(sizes) => sizes,
        None => default_sizes(&legacy(state)),
    };
    let default_profile = store::setting(state.store(), store::DEFAULT_PROFILE)?
        .unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string());
    Ok(RuleBook {
        compiled: FormatSet::compile_lenient(&formats),
        profiles,
        default_profile,
        formats,
        sizes,
    })
}

/// The original language a monitored title recorded, for the `Original` rule.
pub fn original_language<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
) -> Result<Option<Language>> {
    let conn = state.db().get()?;
    Ok(kroma_module_sdk::db::get_monitored(&conn, kind, tmdb_id)?
        .and_then(|m| m.original_language)
        .and_then(|tag| Language::parse(&tag)))
}

/// Makes `id` the profile every title without its own is judged by.
pub fn set_default_profile<S: HostStorage>(state: &S, id: &str) -> Result<()> {
    store::set_setting(state.store(), store::DEFAULT_PROFILE, id)
}

fn seed<S: HostStorage>(state: &S) -> Result<()> {
    let legacy = legacy(state);
    let now = now_ms();
    for format in default_formats() {
        store::save_format(state.store(), &format, now)?;
    }
    let profile = QualityProfile::from_legacy(DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, &legacy);
    store::save_profile(state.store(), &profile, now)?;
    store::save_sizes(state.store(), &default_sizes(&legacy))?;
    store::set_setting(state.store(), store::DEFAULT_PROFILE, DEFAULT_PROFILE_ID)?;
    store::set_setting(state.store(), store::SEEDED, "1")
}

/// What the settings that predate profiles said, read the way the old scorer
/// read them.
pub fn legacy<S: HostStorage>(state: &S) -> LegacySettings {
    let resolution = match state.setting_str("acqResolution", "1080p").as_str() {
        "720p" => Res::R720,
        "2160p" => Res::R2160,
        _ => Res::R1080,
    };
    let list = |key: &str| -> Vec<String> {
        state
            .setting_str(key, "")
            .split(',')
            .map(str::trim)
            .filter(|k| !k.is_empty())
            .map(str::to_string)
            .collect()
    };
    LegacySettings {
        resolution,
        prefer_hevc: state.setting_bool("acqPreferHevc", true),
        min_seeders: state.setting_i64("acqMinSeeders", 2).max(0) as u32,
        max_gb_movie: state.setting_i64("acqMaxSizeGbMovie", 15).max(0) as u64,
        max_gb_episode: state.setting_i64("acqMaxSizeGbEpisode", 3).max(0) as u64,
        required_keywords: list("acqRequiredKeywords"),
        forbidden_keywords: list("acqForbiddenKeywords"),
    }
}
