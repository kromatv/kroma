use std::collections::HashMap;

use kroma_module_sdk::engine::model::{Kind, MediaFile, MediaItem, Show};
use std::path::PathBuf;

use super::files::current_abs;
use super::naming::{self, NameContext, NamingTemplates};

// Proper display title + year per show id, preferring the enriched TMDB
// metadata over the parsed folder name (so a rename produces "Breaking Bad",
// not "breaking bad").
pub(super) fn show_info(shows: &[Show]) -> HashMap<String, (String, Option<u32>)> {
    shows
        .iter()
        .map(|s| {
            let title = s
                .metadata
                .as_ref()
                .and_then(|m| m.title.clone())
                .filter(|t| !t.trim().is_empty())
                .unwrap_or_else(|| s.title.clone());
            let year = s.year.or_else(|| {
                s.metadata
                    .as_ref()
                    .and_then(|m| year_of(m.release_date.as_deref()))
            });
            (s.id.clone(), (title, year))
        })
        .collect()
}

fn year_of(date: Option<&str>) -> Option<u32> {
    date.and_then(|d| d.get(..4)).and_then(|y| y.parse().ok())
}

// The naming context + display title for one library file, or `None` if it
// can't be placed (loose video, missing episode numbers...).
pub(super) fn expected_rel(
    tpl: &NamingTemplates,
    item: &MediaItem,
    file: &MediaFile,
    shows_by_id: &HashMap<String, (String, Option<u32>)>,
) -> Option<(PathBuf, String)> {
    let abs = current_abs(file)?;
    let ext = abs.extension()?.to_str()?.to_string();
    let parsed = kroma_scene::parse_release_name(abs.file_stem()?.to_str()?);
    // The quality + MediaInfo fields shared by movies and episodes: resolution/
    // codec/streams from the probe, source/group/proper from the current name.
    let base = quality_ctx(file, &parsed);
    let (imdb_id, tmdb_id) = item_ids(item);

    match item.kind {
        Kind::Movie | Kind::Video => {
            let title = movie_title(item);
            let ctx = NameContext {
                title: title.clone(),
                year: item.year,
                imdb_id,
                tmdb_id,
                ..base
            };
            Some((tpl.movie_rel_path(&ctx, &ext), title))
        }
        Kind::Episode => {
            let (season, episode) = (item.season?, item.episode?);
            // Proper show title + year from the enriched show, falling back to
            // the episode item's own parsed show title.
            let (show_title, year) = item
                .show_id
                .as_ref()
                .and_then(|id| shows_by_id.get(id))
                .cloned()
                .or_else(|| item.show_title.clone().map(|t| (t, item.year)))?;
            let ctx = NameContext {
                title: show_title.clone(),
                year,
                season: Some(season),
                episode: Some(episode),
                episode_title: item.episode_title.clone(),
                imdb_id,
                tmdb_id,
                ..base
            };
            Some((
                tpl.episode_rel_path(&ctx, &ext),
                format!("{show_title} S{season:02}E{episode:02}"),
            ))
        }
    }
}

// Quality + MediaInfo naming context from a probed file, minus the
// title/year/season/ids the caller fills per kind.
fn quality_ctx(file: &MediaFile, parsed: &kroma_scene::ParsedRelease) -> NameContext {
    let width = file.video.as_ref().and_then(|v| v.width).map(|w| w as i64);
    let (_, _, source) = naming::quality_from_parsed(parsed);
    let hdr = file.video.as_ref().is_some_and(|v| v.hdr);
    let rep_audio = file.audio.as_ref().or_else(|| file.audio_tracks.first());
    NameContext {
        resolution: naming::resolution_from_width(width),
        codec: naming::codec_label(file.video.as_ref().map(|v| v.codec.as_str())),
        source,
        proper: parsed.proper,
        repack: parsed.repack,
        release_group: parsed.group.clone(),
        edition: file.edition.clone(),
        dynamic_range: naming::dynamic_range(hdr || parsed.hdr, parsed.dolby_vision),
        video_bit_depth: file.video.as_ref().and_then(|v| v.bit_depth),
        audio_codec: naming::audio_codec_label(rep_audio.map(|a| a.codec.as_str())),
        audio_channels: naming::audio_channels_label(rep_audio.and_then(|a| a.channels)),
        audio_languages: naming::lang_list(
            file.audio_tracks
                .iter()
                .filter_map(|a| a.language.as_deref()),
        ),
        subtitle_languages: naming::lang_list(
            file.subtitles.iter().filter_map(|s| s.language.as_deref()),
        ),
        ..Default::default()
    }
}

// IMDb + TMDB ids from the item's TMDB metadata, for `{ImdbId}` / `{TmdbId}`.
fn item_ids(item: &MediaItem) -> (Option<String>, Option<u64>) {
    match item.metadata.as_ref() {
        Some(m) => (m.imdb_id.clone(), Some(m.tmdb_id)),
        None => (None, None),
    }
}

// Prefer the localized TMDB title, then the parsed item title.
fn movie_title(item: &MediaItem) -> String {
    item.metadata
        .as_ref()
        .and_then(|m| m.title.clone())
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| item.title.clone())
}
