//! Local WebP cache for remote (TMDB) artwork: downloaded once and transcoded
//! via `ffmpeg` into `<data>/images/`. Falls back to the original remote URL
//! if caching fails.

mod cache;
mod encode;
mod localize;
mod rendition;
mod scratch;
mod upload;

pub use cache::{cache_remote, local_art_missing};
pub(crate) use encode::encode_webp_quality;
pub use localize::{localize, localize_title_art};
pub use rendition::{card_base_png, card_logo_png, jpeg_rendition, sized_rendition};
pub use upload::store_upload;

use std::path::{Path, PathBuf};

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

/// Served by `GET /api/images/:name`.
pub const PUBLIC_PREFIX: &str = "/api/images/";

pub fn images_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("images")
}
