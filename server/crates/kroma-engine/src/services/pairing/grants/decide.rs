use super::{now, tick, Decided, Granted, Grants, Orphaned, PollState, Verdict};

impl<M> Grants<M> {
    /// Approve `handle` for a request whose metadata satisfies `allowed`. False
    /// when the handle is unknown, lapsed, fails the predicate, or was ALREADY
    /// approved. All four answer "no such device", which is all a caller may
    /// learn.
    ///
    /// Refusing the second approval is what makes this one-shot in both
    /// directions. Overwriting would silently discard the first approver's
    /// tokens (rows in SQLite that nothing would then delete) and hand the
    /// device to whoever asked last, which is not a race a pairing flow should
    /// have: two phones can see one waiting television, and so can one phone
    /// twice.
    pub fn authorize(&self, handle: &str, allowed: impl Fn(&M) -> bool, granted: Granted) -> bool {
        let rule = |meta: &mut M| match allowed(meta) {
            true => Verdict::Approve,
            false => Verdict::Refuse(()),
        };
        matches!(self.decide(handle, rule, granted), Decided::Approved)
    }

    /// [`Self::authorize`] for a rule that has more than one way to say no, and
    /// that may record the refusal on the entry it just read: `rule` is handed
    /// the metadata mutably, and a [`Verdict::Burn`] takes the entry down.
    pub fn decide<R>(
        &self,
        handle: &str,
        rule: impl FnOnce(&mut M) -> Verdict<R>,
        granted: Granted,
    ) -> Decided<R> {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        let Some(entry) = map.get_mut(handle).filter(|e| e.granted.is_none()) else {
            return Decided::Gone;
        };
        match rule(&mut entry.meta) {
            Verdict::Approve => {
                entry.granted = Some(granted);
                Decided::Approved
            }
            Verdict::Refuse(reason) => Decided::Refused(reason),
            Verdict::Burn(reason) => {
                self.abandon(map.remove(handle));
                Decided::Refused(reason)
            }
        }
    }

    /// Poll by secret. An approved entry is consumed, so its tokens are handed
    /// out exactly once.
    pub fn poll(&self, secret: &str) -> PollState {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        let Some(handle) = Self::handle_for(&map, secret) else {
            return PollState::Unknown;
        };
        match map.get(&handle).and_then(|e| e.granted.as_ref()) {
            Some(_) => {
                let granted = map.remove(&handle).and_then(|e| e.granted).expect("just matched");
                PollState::Authorized {
                    token: granted.token,
                    access_token: granted.access_token,
                    user: Box::new(granted.user),
                }
            }
            None => PollState::Pending,
        }
    }

    /// Keep the entry holding `secret` alive for another TTL. False when it is
    /// already gone, which tells its device to announce itself again.
    pub fn touch(&self, secret: &str) -> bool {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        let Some(handle) = Self::handle_for(&map, secret) else {
            return false;
        };
        map.entry(handle).and_modify(|e| {
            e.fresh_at = now();
            e.seen = tick();
        });
        true
    }

    /// Forget the entry holding `secret`, surrendering any tokens it accrued.
    pub fn forget(&self, secret: &str) -> Option<Orphaned> {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        let handle = Self::handle_for(&map, secret)?;
        map.remove(&handle)?.orphaned()
    }

    /// Project every live entry NOT yet approved through `view`, dropping the
    /// `None`s.
    ///
    /// Approved-but-uncollected is deliberately excluded: such an entry is spent
    /// (the second approval is refused) and its device is a few seconds from
    /// signing in, so listing it offers a row that can only fail.
    pub fn map_pending<T>(&self, view: impl Fn(&str, &M) -> Option<T>) -> Vec<T> {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        map.iter()
            .filter(|(_, e)| e.granted.is_none())
            .filter_map(|(handle, e)| view(handle, &e.meta))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::pairing::approved;
    use crate::services::pairing::grants::test_support::{file, granted, grants, seq_mint, user};
    use crate::services::pairing::grants::Filed;

    #[test]
    fn a_fresh_request_polls_pending_until_it_is_approved() {
        let g = grants();
        let (handle, secret) = file(&g, "tv", seq_mint());
        assert!(matches!(g.poll(&secret), PollState::Pending));
        assert!(g.authorize(&handle, |_| true, granted()));
        let (token, access_token, user) =
            approved(g.poll(&secret)).expect("an approved request");
        assert_eq!((token.as_str(), access_token.as_str()), ("tok", "acc"));
        assert_eq!(user.id, "u1");
        // Collected exactly once: the entry is gone on the next poll.
        assert!(matches!(g.poll(&secret), PollState::Unknown));
    }

    #[test]
    fn an_unknown_secret_or_handle_is_refused_without_saying_why() {
        let g = grants();
        let (handle, _) = file(&g, "tv", seq_mint());
        assert!(matches!(g.poll("nope"), PollState::Unknown));
        assert!(!g.authorize("nope", |_| true, granted()));
        assert!(!g.touch("nope"));
        assert!(g.forget("nope").is_none());
        // A predicate that refuses reads exactly like an unknown handle.
        assert!(!g.authorize(&handle, |_| false, granted()));
    }

    #[test]
    fn approval_happens_once_and_the_second_asker_is_refused() {
        // Two phones can see one waiting television, and one phone can be
        // tapped twice. Overwriting would discard the first approver's tokens,
        // which are rows nothing else would ever delete, and hand the device to
        // whoever asked last.
        let g = grants();
        let (handle, secret) = file(&g, "tv", seq_mint());
        assert!(g.authorize(&handle, |_| true, granted()));

        let second =
            Granted { token: "tok2".into(), access_token: "acc2".into(), user: user() };
        assert!(!g.authorize(&handle, |_| true, second));

        let (token, ..) = approved(g.poll(&secret)).expect("the FIRST approval");
        assert_eq!(token, "tok");
    }

    #[test]
    fn a_rule_may_refuse_with_a_reason_of_its_own() {
        let g = grants();
        let (handle, secret) = file(&g, "tv", seq_mint());
        let refused = g.decide(&handle, |_| Verdict::Refuse("wrong"), granted());
        assert!(matches!(refused, Decided::Refused("wrong")));
        assert!(matches!(g.poll(&secret), PollState::Pending), "the entry is still there");

        let approved = g.decide(&handle, |_| Verdict::<&str>::Approve, granted());
        assert!(matches!(approved, Decided::Approved));
    }

    #[test]
    fn a_burnt_entry_is_gone_and_reads_as_one_that_never_existed() {
        let g = grants();
        let (handle, secret) = file(&g, "tv", seq_mint());
        let burnt = g.decide(&handle, |_| Verdict::Burn("enough"), granted());
        assert!(matches!(burnt, Decided::Refused("enough")));

        assert!(matches!(g.poll(&secret), PollState::Unknown));
        let again = g.decide(&handle, |_| Verdict::<&str>::Approve, granted());
        assert!(matches!(again, Decided::Gone));
        assert_eq!(g.len(), 0);
    }

    #[test]
    fn a_rule_writes_what_it_learned_back_onto_the_entry() {
        let g: Grants<u32> = Grants::new(300, 4);
        let Filed { handle, .. } = g.insert(0, seq_mint()).expect("room in the store");
        for expected in 1..=3 {
            let seen = g.decide(
                &handle,
                |tries| {
                    *tries += 1;
                    Verdict::Refuse(*tries)
                },
                granted(),
            );
            assert!(matches!(seen, Decided::Refused(n) if n == expected));
        }
    }

    #[test]
    fn a_heartbeat_carries_a_request_past_its_ttl() {
        let g = grants();
        let (_, secret) = file(&g, "tv", seq_mint());
        assert!(g.touch(&secret));
        assert!(matches!(g.poll(&secret), PollState::Pending));
    }

    #[test]
    fn forgetting_surrenders_only_the_tokens_nobody_will_collect() {
        let g = grants();
        let (_, pending) = file(&g, "tv", seq_mint());
        assert!(g.forget(&pending).is_none());

        let (handle, approved) = file(&g, "tv", seq_mint());
        assert!(g.authorize(&handle, |_| true, granted()));
        let orphan = g.forget(&approved).expect("approved but never collected");
        assert_eq!((orphan.token.as_str(), orphan.access_token.as_str()), ("tok", "acc"));
        assert!(matches!(g.poll(&approved), PollState::Unknown));
    }

    #[test]
    fn map_pending_sees_what_is_still_waiting_and_may_skip_some() {
        let g = grants();
        let mut mint = seq_mint();
        file(&g, "keep", &mut mint);
        file(&g, "skip", &mut mint);
        let mut seen = g.map_pending(|handle, meta| (*meta == "keep").then(|| handle.to_string()));
        seen.sort();
        assert_eq!(seen, vec!["h1".to_string()]);
    }

    #[test]
    fn map_pending_hides_a_request_already_approved() {
        // Its device is seconds from signing in and the second approval is
        // refused, so offering the row again can only fail.
        let g = grants();
        let (handle, _) = file(&g, "tv", seq_mint());
        assert_eq!(g.map_pending(|h, _| Some(h.to_string())).len(), 1);

        assert!(g.authorize(&handle, |_| true, granted()));
        assert!(g.map_pending(|h, _| Some(h.to_string())).is_empty());
    }
}
