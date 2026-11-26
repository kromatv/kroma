use crate::domain::metadata::{CastMember, CrewMember, Metadata};
use crate::domain::ratings::{reader_rating, AgeRating, CountryRatings};

use super::super::certifications::Certifications;
use super::super::common::{build_cast, build_crew, studios_of};
use super::certification::country_of;
use super::details_json::{collect_keywords, pick_logo, Details};
use super::{api, tmdb_json, Target, IMG, MAX_CAST, MAX_CREW};

pub(super) fn fetch_details(
    api_key: &str,
    language: &str,
    household: &str,
    target: Target,
    id: u64,
) -> Result<Metadata, ()> {
    // Base language code (e.g. "fr" from "fr-FR") for picking a localized logo.
    let lang2 = language.split('-').next().unwrap_or("en");
    let detail_params = vec![
        ("language", language.to_string()),
        (
            "append_to_response",
            format!(
                "external_ids,credits,images,keywords,{}",
                target.certification_append()
            ),
        ),
        ("include_image_language", format!("{lang2},en,null")),
    ];
    let d: Details = tmdb_json(
        "metadata.details",
        &format!("{}/{}/{id}", api(), target.detail_path()),
        api_key,
        &detail_params,
    )?;
    let country = country_of(language, household);
    Ok(metadata_from(d, target, id, lang2, &country))
}

fn metadata_from(mut d: Details, target: Target, id: u64, lang2: &str, country: &str) -> Metadata {
    let logo_url = d
        .images
        .as_ref()
        .and_then(|i| pick_logo(&i.logos, lang2))
        .map(|p| format!("{IMG}/w500{p}"));
    let certifications = d.release_dates.take().or(d.content_ratings.take());
    let (ratings, age_rating) = age_ratings(certifications, country);
    let (imdb_id, tvdb_id) = ids_of(&mut d);
    let (cast, crew) = people_of(&mut d);
    Metadata {
        provider: "tmdb",
        tmdb_id: d.id,
        imdb_id,
        certification: age_rating.as_ref().map(|r| r.label.clone()),
        logo_url,
        cast,
        crew,
        tvdb_id,
        tmdb_url: format!("https://www.themoviedb.org/{}/{id}", target.web_kind()),
        ratings,
        age_rating,
        ..texts_of(d)
    }
}

fn texts_of(d: Details) -> Metadata {
    Metadata {
        title: d.title.or(d.name),
        original_title: d
            .original_title
            .or(d.original_name)
            .filter(|s| !s.is_empty()),
        tagline: d.tagline.filter(|s| !s.is_empty()),
        overview: d.overview.filter(|s| !s.is_empty()),
        release_date: d
            .release_date
            .or(d.first_air_date)
            .filter(|s| !s.is_empty()),
        tmdb_genre_ids: d.genres.iter().map(|g| g.id).collect(),
        genres: d.genres.into_iter().map(|g| g.name).collect(),
        studios: studios_of(d.production_companies, d.networks),
        keywords: d.keywords.map(collect_keywords).unwrap_or_default(),
        rating: d.vote_average.filter(|v| *v > 0.0),
        poster_url: d.poster_path.map(|p| format!("{IMG}/w500{p}")),
        backdrop_url: d.backdrop_path.map(|p| format!("{IMG}/w1280{p}")),
        ..Metadata::blank()
    }
}

fn ids_of(d: &mut Details) -> (Option<String>, Option<u64>) {
    let ext = d.external_ids.take();
    let imdb_id = d
        .imdb_id
        .take()
        .or_else(|| ext.as_ref().and_then(|e| e.imdb_id.clone()))
        .filter(|s| !s.is_empty());
    let tvdb_id = ext.and_then(|e| e.tvdb_id).filter(|&id| id > 0);
    (imdb_id, tvdb_id)
}

fn people_of(d: &mut Details) -> (Vec<CastMember>, Vec<CrewMember>) {
    let (raw_cast, raw_crew) = d
        .credits
        .take()
        .map(|c| (c.cast, c.crew))
        .unwrap_or_default();
    let created_by = std::mem::take(&mut d.created_by);
    (
        build_cast(raw_cast, MAX_CAST, false),
        build_crew(raw_crew, created_by, MAX_CREW),
    )
}

fn age_ratings(
    certifications: Option<Certifications>,
    country: &str,
) -> (CountryRatings, Option<AgeRating>) {
    let ratings = certifications
        .map(|c| c.every_country())
        .unwrap_or_default();
    let shown = reader_rating(&ratings, country, country);
    (ratings, shown)
}

#[cfg(test)]
mod tests;
