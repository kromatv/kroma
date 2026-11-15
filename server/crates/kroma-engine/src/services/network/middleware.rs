//! Modules that see a decision before it is applied, and may tighten it.
//!
//! A middleware answers the point [`POLICY_POINT`]. It is asked after the
//! guards and the operator's rules, in the order the operator set, and only
//! about a connection that is still allowed: it can block it or move it to a
//! network, never unblock one or send one direct.

use std::collections::{HashMap, VecDeque};
use std::sync::mpsc;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use kroma_http::address::WebTarget;
use kroma_module_wire::{PolicyAsk, PolicyDecision, PolicyVerdict};
use serde::{Deserialize, Serialize};

use super::rules::Action;
use super::Network;
use crate::point::Point;

pub const POLICY_POINT: &str = "network-policy";

/// The setting holding the operator's order: a list of [`Placed`].
pub const MIDDLEWARE_SETTING: &str = "networkMiddleware";

/// How long a middleware has to answer. It is on the path of every connection.
pub const DEADLINE: Duration = Duration::from_millis(200);

const VERDICT_TTL: Duration = Duration::from_secs(5);
const SKIPS_KEPT: usize = 200;
const OBSERVED_BATCH: usize = 50;

/// One middleware in the operator's order. A `required` one blocks the
/// connection when it does not answer in time, where any other is skipped.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placed {
    pub module: String,
    #[serde(default)]
    pub required: bool,
}

/// A middleware that did not answer in time, and what that did to the
/// connection it was asked about. `at` is epoch milliseconds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Skip {
    pub at: i64,
    pub module: String,
    pub caller: String,
    pub purpose: String,
    pub host: String,
    pub port: u16,
    pub blocked: bool,
}

/// One middleware as the admin sees it: where it stands, whether it is
/// answering, and how often it was skipped since the server started.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Standing {
    pub module: String,
    pub required: bool,
    pub answering: bool,
    pub skipped: usize,
    pub last_skip: Option<Skip>,
}

/// What the chain made of a decision: the action, who chose it, and the reason
/// when a middleware blocked it.
pub(super) struct Tightened {
    pub(super) action: Action,
    pub(super) rule: Option<String>,
    pub(super) reason: Option<String>,
}

type Asked = (String, String, String, String, u16, String);

pub(super) struct Middleware {
    point: Point,
    verdicts: Mutex<HashMap<Asked, (Instant, Option<PolicyVerdict>)>>,
    skips: Mutex<VecDeque<Skip>>,
    observed: Mutex<Vec<serde_json::Value>>,
}

fn rule_of(module: &str) -> String {
    format!("middleware:{module}")
}

impl Middleware {
    pub(super) fn answering(point: Point) -> Self {
        Self {
            point,
            verdicts: Mutex::default(),
            skips: Mutex::default(),
            observed: Mutex::default(),
        }
    }

    fn verdict(&self, module: &str, ask: &PolicyAsk) -> Option<PolicyVerdict> {
        let key = (
            module.to_string(),
            ask.caller.clone(),
            ask.purpose.clone(),
            ask.host.clone(),
            ask.port,
            ask.decision.action.clone(),
        );
        let kept = self.verdicts.lock().unwrap_or_else(PoisonError::into_inner).get(&key).cloned();
        if let Some((at, verdict)) = kept {
            if at.elapsed() < VERDICT_TTL {
                return verdict;
            }
        }
        let verdict = self.ask_in_time(module, ask);
        let mut verdicts = self.verdicts.lock().unwrap_or_else(PoisonError::into_inner);
        verdicts.retain(|_, (at, _)| at.elapsed() < VERDICT_TTL);
        verdicts.insert(key, (Instant::now(), verdict.clone()));
        verdict
    }

    fn ask_in_time(&self, module: &str, ask: &PolicyAsk) -> Option<PolicyVerdict> {
        let (answered, answer) = mpsc::channel();
        let (point, module, ask) = (self.point.clone(), module.to_string(), ask.clone());
        std::thread::spawn(move || {
            let _ = answered.send(point.call_module::<_, PolicyVerdict>(&module, "decide", &ask));
        });
        answer.recv_timeout(DEADLINE).ok().flatten()
    }

    fn skipped(&self, skip: Skip) {
        tracing::warn!(
            module = %skip.module,
            caller = %skip.caller,
            host = %skip.host,
            blocked = skip.blocked,
            "a network middleware did not answer in time"
        );
        let mut skips = self.skips.lock().unwrap_or_else(PoisonError::into_inner);
        if skips.len() == SKIPS_KEPT {
            skips.pop_front();
        }
        skips.push_back(skip);
    }
}

impl Network {
    /// The operator's order, as stored.
    pub fn middleware_order(&self) -> Vec<Placed> {
        serde_json::from_value(self.settings.get(MIDDLEWARE_SETTING)).unwrap_or_default()
    }

    /// Stores the order middlewares are asked in, and which of them block a
    /// connection when they do not answer.
    pub fn set_middleware_order(&self, order: Vec<Placed>) -> anyhow::Result<()> {
        let mut seen = Vec::new();
        let unique: Vec<Placed> = order
            .into_iter()
            .filter(|placed| {
                let first = !seen.contains(&placed.module);
                seen.push(placed.module.clone());
                first
            })
            .collect();
        self.settings
            .set_internal(&self.db, MIDDLEWARE_SETTING, serde_json::to_value(unique)?)
    }

    fn chain(&self) -> Vec<Placed> {
        let answering = self.middleware.point.answering();
        if answering.is_empty() {
            return Vec::new();
        }
        let placed = self.middleware_order();
        let mut chain: Vec<Placed> = placed
            .iter()
            .filter(|one| answering.contains(&one.module))
            .cloned()
            .collect();
        for module in answering {
            if !chain.iter().any(|one| one.module == module) {
                chain.push(Placed {
                    module,
                    required: false,
                });
            }
        }
        chain
    }

    /// Every middleware the operator placed or that is answering, in the order
    /// it is asked, for the admin.
    pub fn middleware(&self) -> Vec<Standing> {
        let answering = self.middleware.point.answering();
        let mut placed = self.middleware_order();
        for module in &answering {
            if !placed.iter().any(|one| &one.module == module) {
                placed.push(Placed {
                    module: module.clone(),
                    required: false,
                });
            }
        }
        let skips = self.middleware.skips.lock().unwrap_or_else(PoisonError::into_inner);
        placed
            .into_iter()
            .map(|one| {
                let of_this: Vec<&Skip> = skips.iter().filter(|skip| skip.module == one.module).collect();
                Standing {
                    answering: answering.contains(&one.module),
                    skipped: of_this.len(),
                    last_skip: of_this.last().map(|skip| (*skip).clone()),
                    module: one.module,
                    required: one.required,
                }
            })
            .collect()
    }

    pub(super) fn tightened(
        &self,
        caller: &str,
        purpose: &str,
        target: &WebTarget,
        action: Action,
        rule: Option<String>,
    ) -> Tightened {
        let mut now = Tightened {
            action,
            rule,
            reason: None,
        };
        for placed in self.chain() {
            if now.action == Action::Block {
                break;
            }
            if placed.module == caller {
                continue;
            }
            let ask = PolicyAsk {
                caller: caller.to_string(),
                purpose: purpose.to_string(),
                host: target.host.clone(),
                port: target.port,
                decision: PolicyDecision {
                    action: spelled(&now.action),
                    rule: now.rule.clone(),
                },
            };
            match self.middleware.verdict(&placed.module, &ask) {
                Some(PolicyVerdict::Keep) => {}
                Some(PolicyVerdict::Block { reason }) => {
                    now = Tightened {
                        action: Action::Block,
                        rule: Some(rule_of(&placed.module)),
                        reason: Some(reason.unwrap_or_else(|| format!("blocked by {}", placed.module))),
                    };
                }
                Some(PolicyVerdict::Network { network, .. }) => {
                    if !target.is_local() {
                        now.action = Action::Network(network);
                        now.rule = Some(rule_of(&placed.module));
                    }
                }
                None => {
                    self.middleware.skipped(Skip {
                        at: kroma_primitives::now_ms(),
                        module: placed.module.clone(),
                        caller: ask.caller,
                        purpose: ask.purpose,
                        host: ask.host,
                        port: ask.port,
                        blocked: placed.required,
                    });
                    if placed.required {
                        now = Tightened {
                            action: Action::Block,
                            rule: Some(rule_of(&placed.module)),
                            reason: Some(format!(
                                "the required middleware {} did not answer in time",
                                placed.module
                            )),
                        };
                    }
                }
            }
        }
        now
    }

    pub(super) fn observed(&self, row: serde_json::Value) {
        if self.middleware.point.answering().is_empty() {
            return;
        }
        let batch = {
            let mut waiting = self.middleware.observed.lock().unwrap_or_else(PoisonError::into_inner);
            waiting.push(row);
            if waiting.len() < OBSERVED_BATCH {
                return;
            }
            std::mem::take(&mut *waiting)
        };
        self.send_observed(batch);
    }

    /// Hands every middleware the journal rows that have waited since the last
    /// batch. Called on the journal's own flush, so a quiet server still tells.
    pub fn flush_observed(&self) {
        let batch = std::mem::take(
            &mut *self.middleware.observed.lock().unwrap_or_else(PoisonError::into_inner),
        );
        if !batch.is_empty() {
            self.send_observed(batch);
        }
    }

    fn send_observed(&self, batch: Vec<serde_json::Value>) {
        let point = self.middleware.point.clone();
        std::thread::spawn(move || {
            let body = serde_json::json!({ "flows": batch });
            for module in point.answering() {
                let _ = point.call_module::<_, serde_json::Value>(&module, "observe", &body);
            }
        });
    }
}

fn spelled(action: &Action) -> String {
    match action {
        Action::Direct => "direct".to_string(),
        Action::Block => "block".to_string(),
        Action::Network(name) => name.clone(),
    }
}
