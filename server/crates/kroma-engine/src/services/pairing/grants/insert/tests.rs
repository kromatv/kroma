use super::*;
use crate::services::pairing::grants::test_support::{
    file, granted, grants, place, scope, seq_mint,
};
use crate::services::pairing::grants::PollState;

#[test]
fn mint_keeps_going_until_it_finds_a_free_handle() {
    let g = grants();
    let (first, _) = file(&g, "tv", || "fixed".to_string());
    let mut proposals = ["fixed".to_string(), "other".to_string()].into_iter();
    let (second, _) = file(&g, "tv", move || proposals.next().expect("mint ran dry"));
    assert_eq!(first, "fixed");
    assert_eq!(second, "other");
}

#[test]
fn a_full_store_refuses_rather_than_evicting_someone() {
    // Eviction on an endpoint nobody authenticates to would let whoever
    // asks most often decide whose pairing survives.
    let g = grants();
    let mut mint = seq_mint();
    let (_, first) = file(&g, "tv", &mut mint);
    for _ in 0..3 {
        file(&g, "tv", &mut mint);
    }
    assert_eq!(g.len(), 4);

    assert!(g.insert("tv", &mut mint).is_none());
    assert_eq!(g.len(), 4);
    // And the one that was already there is untouched.
    assert!(matches!(g.poll(&first), PollState::Pending));
}

#[test]
fn refiling_drops_the_callers_own_entries_and_leaves_the_rest() {
    let g = grants();
    let mut mint = seq_mint();
    let (doomed, _) = file(&g, "old", &mut mint);
    let (_, kept) = file(&g, "new", &mut mint);
    assert!(g.authorize(&doomed, |_| true, granted()));

    let again = g.replace_scoped(|m| *m == "old", |_| (), 4, "old", &mut mint);
    assert!(again.filed.is_some());
    assert_eq!(
        again.orphans.len(),
        1,
        "the replaced entry surrendered its tokens"
    );
    assert_eq!(g.len(), 2);
    assert!(matches!(g.poll(&kept), PollState::Pending));
}

#[test]
fn a_full_scope_is_refused_even_while_the_store_has_room() {
    // The slots in a scope belong to the entries that took them, so a
    // newcomer waits rather than pushing a neighbour out.
    let g = grants();
    let mut mint = seq_mint();
    file(&g, "mine", &mut mint);
    file(&g, "mine", &mut mint);
    file(&g, "theirs", &mut mint);

    let refused = g.replace_scoped(|_| false, |m| *m, 2, "mine", &mut mint);
    assert!(refused.filed.is_none());
    assert_eq!(g.len(), 3, "nobody was pushed out to make room");
    assert!(g
        .replace_scoped(|_| false, |m| *m, 2, "theirs", &mut mint)
        .filed
        .is_some());
}

#[test]
fn a_full_store_takes_room_from_the_scope_holding_the_most() {
    // The bound a flood meets: it can only crowd itself out, so the scopes
    // it was keeping out are the ones that survive it.
    let g: Grants<(&str, &str)> = Grants::new(300, 4);
    let mut mint = seq_mint();
    let flood = place(&g, ("loud", "1"), &mut mint);
    place(&g, ("loud", "2"), &mut mint);
    place(&g, ("loud", "3"), &mut mint);
    let quiet = place(&g, ("quiet", "1"), &mut mint);

    let arrival = g.replace_scoped(|_| false, scope, 3, ("new", "1"), &mut mint);
    assert!(arrival.filed.is_some());
    assert_eq!(g.len(), 4);
    assert!(
        matches!(g.poll(&flood.secret), PollState::Unknown),
        "the oldest of the most"
    );
    assert!(
        matches!(g.poll(&quiet.secret), PollState::Pending),
        "one scope, one beacon"
    );
}

#[test]
fn an_entry_crowded_out_surrenders_its_tokens_like_a_lapse_does() {
    let g: Grants<(&str, &str)> = Grants::new(300, 2);
    let mut mint = seq_mint();
    let doomed = place(&g, ("loud", "1"), &mut mint);
    place(&g, ("loud", "2"), &mut mint);
    assert!(g.authorize(&doomed.handle, |_| true, granted()));
    assert!(g.take_orphans().is_empty(), "nothing has left yet");

    assert!(g
        .replace_scoped(|_| false, scope, 2, ("new", "1"), &mut mint)
        .filed
        .is_some());
    let orphans = g.take_orphans();
    assert_eq!(orphans.len(), 1);
    assert_eq!(orphans[0].token, "tok");
}

#[test]
fn a_caller_is_refused_rather_than_making_room_among_its_own() {
    let g: Grants<(&str, &str)> = Grants::new(300, 2);
    let mut mint = seq_mint();
    let first = place(&g, ("mine", "1"), &mut mint);
    place(&g, ("mine", "2"), &mut mint);

    let refused = g.replace_scoped(|_| false, scope, 8, ("mine", "3"), &mut mint);
    assert!(refused.filed.is_none());
    assert!(matches!(g.poll(&first.secret), PollState::Pending));
}
