use crate::i18n;

use super::catalog::{CatalogEntry, MIN_ITEMS};

// Cap on LLM editorial collections kept from one reply.
pub(super) const MAX_LLM: usize = 14;

// JSON shape fragment for one collection, with `title`/`reason` as objects keyed
// by every supported language code (e.g. `"title":{"en":string,"fr":string}`).
fn collection_shape() -> String {
    let fields = i18n::SUPPORTED_LOCALES
        .iter()
        .map(|l| format!("\"{l}\":string"))
        .collect::<Vec<_>>()
        .join(",");
    format!("{{\"title\":{{{fields}}},\"reason\":{{{fields}}},\"members\":[string]}}")
}

// The language rule shared by both curate prompts.
fn language_rule() -> String {
    let codes = i18n::SUPPORTED_LOCALES.join(", ");
    format!(
        "- \"title\" and \"reason\" are objects keyed by language code ({codes}) \
         provide EVERY listed language. Title < 5 words; reason is one short clause."
    )
}

/// Build the (system, user) prompt asking the model to curate editorial
/// collections **from the supplied library titles only**.
pub fn build_curate_prompt(catalog: &[&CatalogEntry]) -> (String, String) {
    let shape = collection_shape();
    let lang_rule = language_rule();
    let system = format!(
        "You are the editorial curator of a personal film & TV library. From the catalog \
         below you assemble compelling themed collections a cinephile would browse.\n\
         Reply with STRICT JSON only no prose, no markdown, no code fences an array shaped:\n\
         [{shape}]\n\
         Rules:\n\
         - Curate a VARIED mix: genre showcases (\"Best Horror\"), acclaimed/Top-list style \
         (\"Modern Classics\", \"IMDb Top\"), franchises & sagas, a decade/era, and a mood.\n\
         - \"members\" MUST be titles copied EXACTLY from the catalog below never invent titles. \
         8-30 members each; only include a collection if it has at least {MIN_ITEMS} real members.\n\
         {lang_rule}\n\
         - Return between 6 and {MAX_LLM} distinct collections."
    );

    let mut user = String::from("Catalog (title (year) genres):\n");
    for e in catalog {
        let year = e.year.map(|y| y.to_string()).unwrap_or_default();
        let genres = e
            .genres
            .iter()
            .take(2)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
        user.push_str(&format!("- {} ({}) {}\n", e.title, year, genres));
    }
    user.push_str("\nReturn the JSON array now.");
    (system, user)
}

/// (system, user) for the **tool-driven** curate flow. The model explores the
/// library with the catalog tools (`list_genres`, `list_people`, `find_titles`,
/// `get_title`) instead of reading a fixed slice, then returns the same JSON
/// shape as [`build_curate_prompt`] except `members` are catalog **ids** the
/// tools returned (resolved by [`resolve_members_by_id`]), so resolution is exact.
pub fn tool_curate_prompt() -> (String, String) {
    let shape = collection_shape();
    let lang_rule = language_rule();
    let system = format!(
        "You are the editorial curator of a personal film & TV library. You have tools to \
         explore it: list_genres, list_people, find_titles (filter by genre / director / actor / \
         keyword / kind / year / rating, with sort + limit) and get_title. Use them to discover \
         what the library actually contains, then assemble compelling, VARIED themed collections \
         a cinephile would browse.\n\
         Plan: call list_genres and list_people to see what's available, then call find_titles to \
         gather the members for each collection idea.\n\
         When done, reply with STRICT JSON only no prose, no markdown, no code fences an array:\n\
         [{shape}]\n\
         Rules:\n\
         - \"members\" MUST be catalog **ids** returned by the tools (each title's \"id\" field) \
         never titles, never invented ids.\n\
         - Curate a varied mix: genre showcases (\"Best Horror\"), acclaimed/top-list style \
         (\"Modern Classics\"), a director or actor spotlight, a franchise/saga, a decade/era, and \
         a mood. {MIN_ITEMS}-30 members each; only keep a collection with at least {MIN_ITEMS} real \
         members.\n\
         {lang_rule}\n\
         - Return between 6 and {MAX_LLM} distinct collections."
    );
    let user = String::from(
        "Explore the library with the tools, then return the JSON array of collections \
         with members as catalog ids.",
    );
    (system, user)
}

#[cfg(test)]
mod tests {
    use super::super::fixtures::entry;
    use super::*;

    #[test]
    fn prompts_mention_locales_and_min_items() {
        let cat = [entry("a", "A", 1.0, "")];
        let refs: Vec<&CatalogEntry> = cat.iter().collect();
        let (system, user) = build_curate_prompt(&refs);
        assert!(system.contains("\"en\":string"));
        assert!(system.contains("\"fr\":string"));
        assert!(user.contains("A ("));
        let (tsystem, _tuser) = tool_curate_prompt();
        assert!(tsystem.contains("list_genres"));
        assert!(tsystem.contains("catalog **ids**"));
    }
}
