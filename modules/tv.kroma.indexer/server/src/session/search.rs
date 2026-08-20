use crate::{engine, Query};

use super::response::{declared_empty, refusal, snippet};
use super::{SearchOutcome, Session, RATE_LIMIT_COOLDOWN};

impl Session {
    /// Run `query` against this indexer: log in if needed, fetch each search
    /// path, and parse the responses into releases.
    pub fn search(&self, query: &Query, wanted_cats: &[u32]) -> SearchOutcome {
        let mut outcome = SearchOutcome::default();
        if let Err(e) = self.ensure_login() {
            tracing::warn!(indexer = %self.def.name, error = %format!("{e:#}"), "login failed");
            outcome.errors.push(format!("{}: login: {e:#}", self.def.name));
            return outcome;
        }
        let requests = engine::build_requests(&self.def, &self.cfg, query, wanted_cats);
        tracing::info!(
            indexer = %self.def.name,
            keywords = %query.keywords(),
            wanted_categories = ?wanted_cats,
            paths = requests.len(),
            "searching",
        );
        if requests.is_empty() {
            tracing::warn!(
                indexer = %self.def.name,
                wanted_categories = ?wanted_cats,
                "definition produced no search path for this query; nothing was asked",
            );
        }
        let mut seen = std::collections::HashSet::new();
        for req in requests {
            self.search_one(&req, &mut seen, &mut outcome);
        }
        tracing::info!(
            indexer = %self.def.name,
            releases = outcome.releases.len(),
            errors = outcome.errors.len(),
            "search done",
        );
        outcome
    }

    fn search_one(
        &self,
        req: &engine::SearchRequest,
        seen: &mut std::collections::HashSet<String>,
        outcome: &mut SearchOutcome,
    ) {
        let fetched = match req.method.as_str() {
            "post" => self.post_form_text(&req.url, &req.inputs),
            _ => self.get_text(&req.url, &req.inputs),
        };
        let body = match fetched {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(
                    indexer = %self.def.name,
                    url = %req.url,
                    method = %req.method,
                    error = %format!("{e:#}"),
                    "fetch failed",
                );
                outcome.errors.push(format!("{}: {e:#}", self.def.name));
                return;
            }
        };
        let bytes = body.len();
        let body = engine::preprocess(&self.def, &self.cfg, &body);
        if let Some(message) = refusal(&req.response_kind, &body) {
            self.note_refusal(req, bytes, &message, outcome);
            return;
        }
        let parsed = match req.response_kind.as_str() {
            "json" => engine::parse_json(&self.def, &self.cfg, &body),
            "xml" => engine::parse_xml(&self.def, &self.cfg, &body),
            _ => engine::parse_html_auto(&self.def, &self.cfg, &body),
        };
        match parsed {
            Ok(rels) => {
                self.note_parsed(req, bytes, &body, rels.len());
                for r in rels {
                    if seen.insert(r.guid.clone()) {
                        outcome.releases.push(r);
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    indexer = %self.def.name,
                    url = %req.url,
                    bytes,
                    kind = %req.response_kind,
                    error = %format!("{e:#}"),
                    "parse failed",
                );
                outcome.errors.push(format!("{}: parse: {e:#}", self.def.name));
            }
        }
    }

    // A tracker that refuses the query answers 200 with an error document, which
    // parses to zero rows: that is the indexer failing, not an empty result.
    fn note_refusal(
        &self,
        req: &engine::SearchRequest,
        bytes: usize,
        message: &str,
        outcome: &mut SearchOutcome,
    ) {
        tracing::warn!(
            indexer = %self.def.name,
            url = %req.url,
            bytes,
            error = %message,
            "the tracker returned an error document",
        );
        if message.contains("429") {
            // Rate limited: stop asking for a while, rather than spending the
            // next search's budget re-earning the same refusal.
            self.hold_off(RATE_LIMIT_COOLDOWN);
        } else {
            // Anything else it refuses may be the session, so the next search
            // logs in again rather than reusing a dead one.
            self.invalidate_login();
        }
        outcome.errors.push(format!("{}: {message}", self.def.name));
    }

    // The tracker answered with no rows: either it genuinely has nothing, or the
    // definition's row selector no longer matches its markup. Only the body
    // tells the two apart, so a short one is quoted.
    fn note_parsed(&self, req: &engine::SearchRequest, bytes: usize, body: &str, rows: usize) {
        if rows == 0 {
            // A newznab `total="0"` response header is the tracker stating it
            // has nothing, so warning about selectors there cries wolf.
            if declared_empty(body) {
                tracing::info!(
                    indexer = %self.def.name,
                    url = %req.url,
                    bytes,
                    "the tracker has nothing for this query",
                );
                return;
            }
            tracing::warn!(
                indexer = %self.def.name,
                url = %req.url,
                bytes,
                kind = %req.response_kind,
                body = %snippet(body),
                "answered, but no row matched the definition's selectors",
            );
        } else {
            tracing::info!(
                indexer = %self.def.name,
                url = %req.url,
                bytes,
                kind = %req.response_kind,
                parsed = rows,
                "response parsed",
            );
        }
    }
}
