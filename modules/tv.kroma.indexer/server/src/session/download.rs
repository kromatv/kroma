use anyhow::{bail, Result};

use scraper::ElementRef;

use crate::context::Context;
use crate::definition::Download;
use crate::selector;
use crate::{engine, template, Release};

use super::{DownloadTarget, Session};

impl Session {
    /// Turn a search result into something grabbable: its magnet if present,
    /// else the `.torrent` link, else by fetching the details page and applying
    /// the definition's `download` selectors / infohash rule.
    pub fn resolve_download(&self, release: &Release) -> Result<DownloadTarget> {
        if let Some(m) = &release.magnet {
            return Ok(DownloadTarget::Magnet(m.clone()));
        }
        if let Some(download) = &self.def.download {
            let details = release
                .details_url
                .clone()
                .or_else(|| release.link.clone())
                .ok_or_else(|| anyhow::anyhow!("no details page to resolve the download from"))?;
            let page = self.get_text(&details, &[])?;
            let doc = selector::parse_document(&page);
            let root = doc.root_element();
            let ctx = Context::with_config(&self.def, &self.cfg);

            if let Some(target) = self.download_from_selectors(download, root, &ctx) {
                return Ok(target);
            }
            // Fall back to an infohash rule -> synthesize a magnet.
            if let Some(target) = self.download_from_infohash(download, root, release) {
                return Ok(target);
            }
            bail!("download selectors matched nothing on the details page");
        }
        if let Some(link) = &release.link {
            return Ok(classify_target(link));
        }
        bail!("release has no magnet, link, or download rule")
    }

    // Skips an empty match rather than stopping at the first selector that
    // merely exists.
    fn download_from_selectors(
        &self,
        download: &Download,
        root: ElementRef,
        ctx: &Context,
    ) -> Option<DownloadTarget> {
        for sel in &download.selectors {
            let Some(css) = &sel.selector else { continue };
            let css = template::render(css, ctx);
            if let Some(el) = selector::select_first(root, &css) {
                let val = match &sel.attribute {
                    Some(a) => selector::element_attr(el, a).unwrap_or_default(),
                    None => selector::element_text(el),
                };
                if val.is_empty() {
                    continue;
                }
                return Some(classify_target(&engine::join_url(&self.rendered_base(), &val)));
            }
        }
        None
    }

    fn download_from_infohash(
        &self,
        download: &Download,
        root: ElementRef,
        release: &Release,
    ) -> Option<DownloadTarget> {
        let ih = download.infohash.as_ref()?;
        let hash_sel =
            ih.hash.as_ref().and_then(|h| h.selector.clone()).or_else(|| ih.selector.clone())?;
        let el = selector::select_first(root, &hash_sel)?;
        let hash = match &ih.attribute {
            Some(a) => selector::element_attr(el, a).unwrap_or_default(),
            None => selector::element_text(el),
        };
        if hash.is_empty() {
            return None;
        }
        Some(DownloadTarget::Magnet(format!(
            "magnet:?xt=urn:btih:{hash}&dn={}",
            crate::filters::url_encode(&release.title)
        )))
    }
}

fn classify_target(url: &str) -> DownloadTarget {
    if url.starts_with("magnet:") {
        DownloadTarget::Magnet(url.to_string())
    } else {
        DownloadTarget::TorrentUrl(url.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_download_target() {
        assert_eq!(classify_target("magnet:?xt=1"), DownloadTarget::Magnet("magnet:?xt=1".into()));
        assert_eq!(
            classify_target("https://x/t.torrent"),
            DownloadTarget::TorrentUrl("https://x/t.torrent".into())
        );
    }
}
