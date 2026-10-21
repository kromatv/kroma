use std::path::Path;

use crate::model::Metadata;

use super::cache::{cache, cache_verbatim};

/// Rewrites a [`Metadata`]'s poster/backdrop URLs to locally-cached WebP.
/// Leaves any image unchanged that can't be cached.
pub fn localize(data_dir: &Path, mut meta: Metadata) -> Metadata {
    if let Some(url) = meta.poster_url.as_deref() {
        if let Some(local) = cache(data_dir, url) {
            meta.poster_url = Some(local);
        }
    }
    if let Some(url) = meta.backdrop_url.as_deref() {
        if let Some(local) = cache(data_dir, url) {
            meta.backdrop_url = Some(local);
        }
    }
    // Logo kept as PNG, not transcoded: transparency must survive.
    if let Some(url) = meta.logo_url.as_deref() {
        if let Some(local) = cache_verbatim(data_dir, url, "png") {
            meta.logo_url = Some(local);
        }
    }
    for member in &mut meta.cast {
        if let Some(url) = member.profile_url.as_deref() {
            if let Some(local) = cache(data_dir, url) {
                member.profile_url = Some(local);
            }
        }
    }
    meta
}

/// Caches only the artwork that carries the title as printed art for one
/// language: the poster and the logo.
pub fn localize_title_art(data_dir: &Path, mut meta: Metadata) -> Metadata {
    // A download that failed leaves the remote URL in hand. Kept, it is stored
    // as this language's art and served to every viewer straight from TMDB,
    // bypassing the cache and announcing them to it. Dropped, the language
    // simply has no art of its own and reads the core's, which is right.
    meta.poster_url = meta
        .poster_url
        .as_deref()
        .and_then(|url| cache(data_dir, url));
    // Logo kept as PNG, not transcoded: transparency must survive.
    meta.logo_url = meta
        .logo_url
        .as_deref()
        .and_then(|url| cache_verbatim(data_dir, url, "png"));
    meta
}
