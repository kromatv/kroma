//! Which titles are made for children (ACCT-180, ACCT-181), read by the
//! metadata provider's own genre ids so the rule holds in every language.

/// TMDB's Animation and Family, which films and shows share, and Kids, which
/// only shows carry.
pub const MADE_FOR_CHILDREN: [u32; 3] = [16, 10751, 10762];

/// TMDB's Horror, Thriller, Crime and War for films, and Crime and War &
/// Politics for shows.
pub const NEVER_FOR_CHILDREN: [u32; 5] = [27, 53, 80, 10752, 10768];

/// Whether a title with these TMDB genre ids is made for children: one of
/// [`MADE_FOR_CHILDREN`] and none of [`NEVER_FOR_CHILDREN`].
pub fn made_for_children(genre_ids: &[u32]) -> bool {
    let has = |set: &[u32]| genre_ids.iter().any(|id| set.contains(id));
    has(&MADE_FOR_CHILDREN) && !has(&NEVER_FOR_CHILDREN)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn animation_family_and_kids_make_a_title_one_for_children() {
        assert!(made_for_children(&[16]));
        assert!(made_for_children(&[10751, 35]));
        assert!(made_for_children(&[10762]));
    }

    #[test]
    fn a_title_with_no_childrens_genre_is_not_one() {
        assert!(!made_for_children(&[28, 35]));
        assert!(!made_for_children(&[]));
    }

    #[test]
    fn a_genre_kept_from_children_outweighs_every_other() {
        for kept in NEVER_FOR_CHILDREN {
            assert!(!made_for_children(&[16, 10751, kept]), "{kept}");
        }
    }
}
