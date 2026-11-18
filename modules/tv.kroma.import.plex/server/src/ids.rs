use crate::wire::ExternalIds;
use crate::xml::Element;

const MAX_ID_BYTES: usize = 32;

/// The ids other catalogues give a title, read from its `Guid` children:
/// `imdb://tt0944947`, `tmdb://1399`, `tvdb://121361`. Any other form is left
/// out.
pub(crate) fn external(item: &Element) -> ExternalIds {
    let mut ids = ExternalIds::default();
    for guid in item.named("Guid") {
        let Some((catalogue, id)) = guid.attr("id").and_then(|id| id.split_once("://")) else {
            continue;
        };
        let plain = !id.is_empty()
            && id.len() <= MAX_ID_BYTES
            && id.bytes().all(|byte| byte.is_ascii_alphanumeric());
        if !plain {
            continue;
        }
        match catalogue {
            "tmdb" => ids.tmdb = Some(id.to_string()),
            "imdb" => ids.imdb = Some(id.to_string()),
            "tvdb" => ids.tvdb = Some(id.to_string()),
            _ => {}
        }
    }
    ids
}
