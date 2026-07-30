//! Deterministic taste modelling: cluster a user's watch history in embedding
//! space into a few coherent "taste groups", each summarized by its example
//! titles + dominant genres/keywords. This is the *understanding* half of the
//! smart-sections feature it sharpens automatically as history grows. The LLM
//! then only has to *name* each cluster (see the `sections.personalize` job),
//! which keeps the model small and the catalog items real (no hallucination).

use std::collections::HashMap;

use crate::db::{self, Pool};
use crate::services::sections::math::{dot, normalize};
use crate::services::sections::VectorCache;

/// Below this the home falls back to the static themed bank.
pub const MIN_WATCHED: usize = 5;

/// One taste group. Every list is ordered most-representative first: `ids` and
/// `titles` nearest-to-centroid, `genres` and `keywords` most-common.
#[derive(Debug, Clone)]
pub struct Cluster {
    pub ids: Vec<String>,
    pub titles: Vec<String>,
    pub genres: Vec<String>,
    pub keywords: Vec<String>,
}

/// Cluster `watched` into at most `k` taste groups. Empty when the user has too
/// little embeddable history. Pure + deterministic (fixed seeding) so re-runs are
/// stable.
pub fn cluster(pool: &Pool, vectors: &VectorCache, watched: &[String], k: usize) -> Vec<Cluster> {
    let mut vecs = vectors.vectors_for(watched);
    if vecs.len() < MIN_WATCHED {
        return Vec::new();
    }
    // Keep only the dominant dimension (a stale vector from a backend switch
    // would otherwise poison the centroids).
    let dim = vecs.iter().map(|(_, v)| v.len()).max().unwrap_or(0);
    vecs.retain(|(_, v)| v.len() == dim && dim > 0);
    if vecs.len() < MIN_WATCHED {
        return Vec::new();
    }

    let k = k.clamp(1, vecs.len());
    let assignments = kmeans(&vecs, k);

    let mut groups: Vec<Vec<usize>> = vec![Vec::new(); k];
    for (i, &c) in assignments.iter().enumerate() {
        groups[c].push(i);
    }

    let all_ids: Vec<&str> = vecs.iter().map(|(id, _)| id.as_str()).collect();
    let items = db::items_by_ids(pool, &all_ids).unwrap_or_default();
    let meta: HashMap<&str, &crate::model::MediaItem> = items.iter().map(|it| (it.id.as_str(), it)).collect();

    let mut clusters = Vec::new();
    for members in groups {
        if members.is_empty() {
            continue;
        }
        // Centroid + order members nearest-first for representative picks.
        let centroid = mean(&members.iter().map(|&i| vecs[i].1.as_slice()).collect::<Vec<_>>());
        let mut ranked: Vec<(usize, f32)> =
            members.iter().map(|&i| (i, dot(&centroid, &vecs[i].1))).collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1));

        let ids: Vec<String> = ranked.iter().map(|&(i, _)| vecs[i].0.clone()).collect();
        let titles: Vec<String> = ids
            .iter()
            .filter_map(|id| meta.get(id.as_str()).map(|it| it.title.clone()))
            .take(6)
            .collect();
        let (genres, keywords) = aggregate_tags(&ids, &meta);
        clusters.push(Cluster { ids, titles, genres, keywords });
    }
    clusters.sort_by_key(|b| std::cmp::Reverse(b.ids.len()));
    clusters
}

// Tally genres + keywords across a cluster's members; most-common first.
fn aggregate_tags(ids: &[String], meta: &HashMap<&str, &crate::model::MediaItem>) -> (Vec<String>, Vec<String>) {
    let mut genres: HashMap<String, usize> = HashMap::new();
    let mut keywords: HashMap<String, usize> = HashMap::new();
    for id in ids {
        if let Some(m) = meta.get(id.as_str()).and_then(|it| it.metadata.as_ref()) {
            for g in &m.genres {
                *genres.entry(g.clone()).or_default() += 1;
            }
            for k in &m.keywords {
                *keywords.entry(k.clone()).or_default() += 1;
            }
        }
    }
    (top_n(genres, 5), top_n(keywords, 8))
}

fn top_n(counts: HashMap<String, usize>, n: usize) -> Vec<String> {
    let mut v: Vec<(String, usize)> = counts.into_iter().collect();
    // Name breaks a count tie, so the order is stable run to run.
    v.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    v.into_iter().take(n).map(|(k, _)| k).collect()
}

const KMEANS_ITERS: usize = 12;

// Assign each vector to one of `k` clusters. Deterministic seeding (evenly
// spaced picks) so the same history yields the same grouping run to run.
fn kmeans(vecs: &[(String, Vec<f32>)], k: usize) -> Vec<usize> {
    let n = vecs.len();
    let dim = vecs[0].1.len();
    let mut centroids: Vec<Vec<f32>> =
        (0..k).map(|c| vecs[(c * n) / k].1.clone()).collect();

    let mut assign = vec![0usize; n];
    for _ in 0..KMEANS_ITERS {
        let changed = assign_clusters(vecs, &centroids, &mut assign, k);
        recompute_centroids(vecs, &assign, &mut centroids, k, dim);
        if !changed {
            break;
        }
    }
    assign
}

// Assign each vector to its nearest centroid (max dot product). Returns whether
// any assignment changed this pass (the k-means convergence signal).
fn assign_clusters(
    vecs: &[(String, Vec<f32>)],
    centroids: &[Vec<f32>],
    assign: &mut [usize],
    k: usize,
) -> bool {
    let mut changed = false;
    for (i, (_, v)) in vecs.iter().enumerate() {
        let best = (0..k)
            .max_by(|&a, &b| dot(&centroids[a], v).total_cmp(&dot(&centroids[b], v)))
            .unwrap_or(0);
        if best != assign[i] {
            assign[i] = best;
            changed = true;
        }
    }
    changed
}

// Recompute each centroid as the (normalized) mean of its assigned members.
// Empty clusters keep their previous centroid.
fn recompute_centroids(
    vecs: &[(String, Vec<f32>)],
    assign: &[usize],
    centroids: &mut [Vec<f32>],
    k: usize,
    dim: usize,
) {
    let mut sums = vec![vec![0.0f32; dim]; k];
    let mut counts = vec![0usize; k];
    for (i, (_, v)) in vecs.iter().enumerate() {
        let c = assign[i];
        counts[c] += 1;
        for (s, x) in sums[c].iter_mut().zip(v) {
            *s += x;
        }
    }
    for c in 0..k {
        if counts[c] > 0 {
            for s in &mut sums[c] {
                *s /= counts[c] as f32;
            }
            normalize(&mut sums[c]);
            centroids[c] = std::mem::take(&mut sums[c]);
        }
    }
}

fn mean(vectors: &[&[f32]]) -> Vec<f32> {
    let dim = vectors.first().map(|v| v.len()).unwrap_or(0);
    let mut sum = vec![0.0f32; dim];
    for v in vectors {
        for (s, x) in sum.iter_mut().zip(*v) {
            *s += x;
        }
    }
    if !vectors.is_empty() {
        for s in &mut sum {
            *s /= vectors.len() as f32;
        }
    }
    normalize(&mut sum);
    sum
}

#[cfg(test)]
mod tests {
    use super::*;

    // Two well-separated blobs in 2-D → k-means must split them cleanly.
    #[test]
    fn kmeans_separates_two_blobs() {
        let mk = |x: f32, y: f32| {
            let mut v = vec![x, y];
            normalize(&mut v);
            v
        };
        let vecs: Vec<(String, Vec<f32>)> = vec![
            ("a".into(), mk(1.0, 0.05)),
            ("b".into(), mk(1.0, 0.0)),
            ("c".into(), mk(0.95, 0.1)),
            ("d".into(), mk(0.05, 1.0)),
            ("e".into(), mk(0.0, 1.0)),
            ("f".into(), mk(0.1, 0.95)),
        ];
        let assign = kmeans(&vecs, 2);
        // a,b,c share a cluster; d,e,f share the other.
        assert_eq!(assign[0], assign[1]);
        assert_eq!(assign[1], assign[2]);
        assert_eq!(assign[3], assign[4]);
        assert_eq!(assign[4], assign[5]);
        assert_ne!(assign[0], assign[3]);
    }

    #[test]
    fn top_n_orders_by_count() {
        let mut counts = HashMap::new();
        counts.insert("action".to_string(), 5);
        counts.insert("drama".to_string(), 2);
        counts.insert("comedy".to_string(), 8);
        assert_eq!(top_n(counts, 2), vec!["comedy", "action"]);
    }

    #[test]
    fn top_n_ties_break_by_name() {
        let mut counts = HashMap::new();
        counts.insert("zeta".to_string(), 3);
        counts.insert("alpha".to_string(), 3);
        // Equal counts -> alphabetical.
        assert_eq!(top_n(counts, 2), vec!["alpha", "zeta"]);
    }

    #[test]
    fn mean_averages_then_normalizes() {
        let a = vec![2.0f32, 0.0];
        let b = vec![0.0f32, 2.0];
        let m = mean(&[a.as_slice(), b.as_slice()]);
        // mean = [1,1], normalized -> [0.707..,0.707..]
        assert!((m[0] - std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-6);
        assert!((m[1] - std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-6);
    }

    #[test]
    fn mean_of_nothing_is_empty() {
        assert!(mean(&[]).is_empty());
    }

    fn test_pool() -> Pool {
        static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("kroma-taste-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        crate::db::init(&path).unwrap()
    }

    #[test]
    fn cluster_empty_when_too_little_history() {
        let pool = test_pool();
        let cache = VectorCache::new(); // no embeddings loaded
        // No watched ids, and even if there were the cache is empty -> below MIN_WATCHED.
        assert!(cluster(&pool, &cache, &[], 3).is_empty());
        let watched: Vec<String> = (0..3).map(|i| format!("id{i}")).collect();
        assert!(cluster(&pool, &cache, &watched, 3).is_empty());
    }

    use crate::test_support::{seed_library, seed_movie, test_state};

    // Two well-separated blobs in 2-D, plus the metadata each title carries.
    fn seed_taste_library(state: &crate::state::SharedState) {
        seed_library(state, "lib-movies", "movies");
        // Blob A: four thrillers. Blob B: three comedies.
        // Every title in a blob shares its dominant genre; the second genre
        // varies so the "most common first" ordering is unambiguous rather than
        // decided by the alphabetical tiebreak.
        // The SMALLER blob comes first, so "biggest group first" has to actually
        // reorder rather than agreeing with the order k-means happened to
        // produce.
        for (id, title, genres, x, y) in [
            ("a1", "Airplane!", vec!["Comedy", "Parody"], 1.0, 0.02),
            ("a2", "Groundhog Day", vec!["Comedy", "Romance"], 1.0, 0.0),
            ("a3", "The Nice Guys", vec!["Comedy", "Action"], 0.98, 0.05),
            ("b1", "Heat", vec!["Thriller", "Crime"], 0.02, 1.0),
            ("b2", "Sicario", vec!["Thriller", "Crime"], 0.0, 1.0),
            ("b3", "Prisoners", vec!["Thriller", "Mystery"], 0.05, 0.99),
            ("b4", "Zodiac", vec!["Thriller", "History"], 0.03, 0.98),
        ] {
            seed_movie(state, id);
            let meta = serde_json::json!({
                "tmdbId": 1,
                "title": title,
                "overview": null,
                "genres": genres,
                "keywords": ["neo-noir", "ensemble"],
                "tmdbUrl": "https://www.themoviedb.org/movie/1",
            })
            .to_string();
            state
                .db
                .get()
                .unwrap()
                .execute(
                    &format!("UPDATE items SET title = \'{title}\', metadata = json(\'{meta}\') WHERE id = \'{id}\'"),
                    [],
                )
                .unwrap();
            let mut v = vec![x, y];
            normalize(&mut v);
            crate::db::set_item_vector(&state.db, id, &v).unwrap();
        }
    }

    fn warm_cache(state: &crate::state::SharedState) -> VectorCache {
        let cache = VectorCache::new();
        cache.refresh_if_stale(&state.db).unwrap();
        cache
    }

    fn watched() -> Vec<String> {
        ["a1", "a2", "a3", "b1", "b2", "b3", "b4"].iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn too_little_history_is_not_worth_clustering() {
        // Below MIN_WATCHED the home falls back to the static themed bank -
        // clusters built from three titles say more about noise than taste.
        let state = test_state();
        seed_taste_library(&state);
        let cache = warm_cache(&state);
        let thin: Vec<String> = watched().into_iter().take(MIN_WATCHED - 1).collect();
        assert!(cluster(&state.db, &cache, &thin, 2).is_empty());
    }

    #[test]
    fn history_without_embeddings_does_not_count_toward_the_minimum() {
        // A big watch history of un-embedded titles is still no signal.
        let state = test_state();
        seed_taste_library(&state);
        let cache = warm_cache(&state);
        let mut ids = watched();
        ids.extend((0..20).map(|n| format!("never-embedded-{n}")));
        // The 7 real ones still cluster; the 20 phantoms neither help nor break it.
        assert!(!cluster(&state.db, &cache, &ids, 2).is_empty());

        let phantoms: Vec<String> = (0..20).map(|n| format!("never-embedded-{n}")).collect();
        assert!(cluster(&state.db, &cache, &phantoms, 2).is_empty());
    }

    #[test]
    fn taste_groups_come_back_biggest_first_and_split_by_subject() {
        let state = test_state();
        seed_taste_library(&state);
        let cache = warm_cache(&state);
        let clusters = cluster(&state.db, &cache, &watched(), 2);

        assert_eq!(clusters.len(), 2);
        // The four thrillers are the bigger group and come first, even though
        // the three comedies are the ones k-means sees first.
        assert_eq!(clusters[0].ids.len(), 4);
        assert_eq!(clusters[1].ids.len(), 3);
        // Each group is coherent: no comedy landed among the thrillers.
        assert!(clusters[0].ids.iter().all(|id| id.starts_with('b')), "{:?}", clusters[0].ids);
        assert!(clusters[1].ids.iter().all(|id| id.starts_with('a')), "{:?}", clusters[1].ids);
        // ...and each is summarized by its own dominant genre, which is what the
        // LLM gets to name it from.
        assert_eq!(clusters[0].genres.first().map(String::as_str), Some("Thriller"));
        assert_eq!(clusters[1].genres.first().map(String::as_str), Some("Comedy"));
        assert_eq!(clusters[0].titles.len(), 4);
        assert!(clusters[0].titles.contains(&"Heat".to_string()));
    }

    #[test]
    fn clustering_the_same_history_twice_gives_the_same_answer() {
        // The section titles are regenerated on a schedule; a non-deterministic
        // clustering would reshuffle someone's home page for no reason.
        let state = test_state();
        seed_taste_library(&state);
        let cache = warm_cache(&state);
        let first = cluster(&state.db, &cache, &watched(), 2);
        let second = cluster(&state.db, &cache, &watched(), 2);
        let ids = |cs: &[Cluster]| cs.iter().map(|c| c.ids.clone()).collect::<Vec<_>>();
        assert_eq!(ids(&first), ids(&second));
    }

    #[test]
    fn k_is_clamped_to_what_the_history_can_support() {
        let state = test_state();
        seed_taste_library(&state);
        let cache = warm_cache(&state);
        // Asking for more groups than titles cannot produce empty groups.
        let many = cluster(&state.db, &cache, &watched(), 100);
        assert!(many.len() <= watched().len());
        assert!(many.iter().all(|c| !c.ids.is_empty()));
        // Asking for none still gives one.
        assert_eq!(cluster(&state.db, &cache, &watched(), 0).len(), 1);
    }

    #[test]
    fn a_partial_re_embed_keeps_only_the_new_dimension() {
        // Mixing dimensions would poison the centroids, so only one survives -
        // and it is the LARGEST, not the most common. Worth stating because it
        // is asymmetric: switching to a bigger embedder makes the few new
        // vectors win (and clustering goes quiet until the pass finishes),
        // whereas switching to a smaller one lets the stale majority win until
        // then.
        let state = test_state();
        seed_taste_library(&state);
        // One title re-embedded at a larger dimension mid-pass.
        crate::db::set_item_vector(&state.db, "a1", &[0.5, 0.5, 0.5, 0.5]).unwrap();
        let cache = warm_cache(&state);
        // Only that one vector is at the max dim, which is below MIN_WATCHED.
        assert!(cluster(&state.db, &cache, &watched(), 2).is_empty());
    }

    #[test]
    fn keywords_do_not_survive_the_write_that_enrichment_performs() {
        // `aggregate_tags` collects `Metadata::keywords` for the LLM prompt, but
        // that field is `#[serde(skip_serializing)]`: enrichment consumes it
        // in-memory and never writes it. So a cluster built from stored metadata
        // has genres and no keywords - not because the aggregation is wrong, but
        // because there is nothing in the column to aggregate.
        //
        // Pinned rather than "fixed": whoever wants keywords in the taste prompt
        // has to decide where they come from. Written through the real writer,
        // since hand-rolled JSON would put them back and hide the whole point.
        let state = test_state();
        seed_taste_library(&state);
        let mut meta: crate::model::Metadata = serde_json::from_str(
            r#"{"tmdbId":1,"title":"Airplane!","overview":null,"genres":["Comedy"],"tmdbUrl":"https://x/1"}"#,
        )
        .unwrap();
        meta.keywords = vec!["neo-noir".into(), "heist".into()];
        assert_eq!(meta.keywords.len(), 2, "the value exists before the write");
        crate::db::set_item_metadata(&state.db, "a1", &meta).unwrap();

        let stored = crate::db::items_by_ids(&state.db, &["a1"]).unwrap();
        let round_tripped = stored[0].metadata.as_ref().unwrap();
        assert_eq!(round_tripped.genres, ["Comedy"], "genres do survive");
        assert!(round_tripped.keywords.is_empty(), "keywords came back from the column");

        let cache = warm_cache(&state);
        let clusters = cluster(&state.db, &cache, &watched(), 2);
        let a1_group = clusters.iter().find(|c| c.ids.iter().any(|id| id == "a1")).unwrap();
        assert!(!a1_group.genres.is_empty());
        assert!(a1_group.keywords.iter().all(|k| k != "heist"));
    }
}
