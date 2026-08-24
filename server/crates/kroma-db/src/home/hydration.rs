//! Ranked ids turned back into the rows a section renders.

use anyhow::Result;

use kroma_domain::MediaItem;

use crate::{get_shows_by_ids, items_by_ids_ordered, Pool, IN_CHUNK};

/// Hydrate item ids into full [`MediaItem`]s, preserving the given order and
/// silently dropping ids without a backing `items` row (e.g. show vectors).
pub fn items_by_ids(pool: &Pool, ids: &[&str]) -> Result<Vec<MediaItem>> {
    let conn = pool.get()?;
    Ok(items_by_ids_ordered(&conn, ids)?)
}

/// The distinct parent-show ids behind `ids` (only episode rows have one), in
/// [`IN_CHUNK`]-sized batches. A lean projection on purpose: callers that just
/// need "which shows does this history touch?" would otherwise hydrate every id
/// through [`items_by_ids`], paying for the metadata blob plus a files/markers
/// batch to read a single column. `DISTINCT` is per chunk, so a caller folding
/// into a set still gets the dedup it expects.
pub fn show_ids_for(pool: &Pool, ids: &[&str]) -> Result<Vec<String>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let conn = pool.get()?;
    let mut out = Vec::new();
    for chunk in ids.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT DISTINCT show_id FROM items WHERE show_id IS NOT NULL AND id IN ({ph})"
        ))?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), |r| {
            r.get::<_, String>(0)
        })?;
        for row in rows {
            out.push(row?);
        }
    }
    Ok(out)
}

/// Hydrate ranked ids into [`SectionItem`]s, preserving order: each id resolves
/// to a movie (an `items` row) or a show (a `shows` row); unknown ids drop. This
/// is what lets recommendation rows mix films and séries both are embedded and
/// ranked, but a show id has no `items` row, so [`items_by_ids`] alone drops it.
pub fn entities_by_ids(pool: &Pool, ids: &[&str]) -> Result<Vec<kroma_domain::SectionItem>> {
    use kroma_domain::{SectionItem, Show};
    use std::collections::HashMap;

    let mut item_map: HashMap<String, MediaItem> = items_by_ids(pool, ids)?
        .into_iter()
        .map(|i| (i.id.clone(), i))
        .collect();
    let owned: Vec<String> = ids.iter().map(ToString::to_string).collect();
    let mut show_map: HashMap<String, Show> = get_shows_by_ids(pool, &owned)?
        .into_iter()
        .map(|s| (s.id.clone(), s))
        .collect();

    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(item) = item_map.remove(*id) {
            out.push(SectionItem::Movie {
                item: Box::new(item),
            });
        } else if let Some(show) = show_map.remove(*id) {
            out.push(SectionItem::Show {
                show: Box::new(show),
            });
        }
    }
    Ok(out)
}

/// `MAX(updated_at)` over `item_vectors` a cheap change-stamp the in-memory
/// `crate::services::sections::VectorCache` polls to know when to reload (it
/// changes on every re-embed, so it also catches a backend/dimension switch).
pub fn vectors_max_updated_at(pool: &Pool) -> Result<Option<String>> {
    let conn = pool.get()?;
    let stamp: Option<String> =
        conn.query_row("SELECT MAX(updated_at) FROM item_vectors", [], |r| r.get(0))?;
    Ok(stamp)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_support::*;
    use kroma_domain::SectionItem;
    #[test]
    fn hydration_and_vectors_stamp() {
        let p = seeded();
        // items_by_ids drops unknown ids (and show ids, which have no items row).
        let items = items_by_ids(&p, &["c1", "ghost", "sh1"]).unwrap();
        assert_eq!(
            items.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(),
            ["c1"]
        );

        // show_ids_for projects episodes to their parent show; movies and unknown
        // ids contribute nothing, and an empty input never hits the DB.
        assert_eq!(
            show_ids_for(&p, &["e1", "c1", "ghost"]).unwrap(),
            vec!["sh1".to_string()]
        );
        assert!(show_ids_for(&p, &[]).unwrap().is_empty());

        // entities_by_ids mixes movies + shows, order preserved, unknowns dropped.
        let ents = entities_by_ids(&p, &["c1", "sh1", "ghost"]).unwrap();
        assert_eq!(ents.len(), 2);
        assert!(matches!(&ents[0], SectionItem::Movie { item } if item.id == "c1"));
        assert!(matches!(&ents[1], SectionItem::Show { show } if show.id == "sh1"));

        // Vector staleness stamp: None until a vector exists.
        assert!(vectors_max_updated_at(&p).unwrap().is_none());
        p.get()
            .unwrap()
            .execute("INSERT INTO item_vectors (id,dim,vec,updated_at) VALUES ('c1',2,x'0000','2026-01-01')", [])
            .unwrap();
        assert_eq!(
            vectors_max_updated_at(&p).unwrap().as_deref(),
            Some("2026-01-01")
        );
    }
}
