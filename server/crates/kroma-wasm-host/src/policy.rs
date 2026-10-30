use crate::Response;

/// One `net.fetch` a module made, as the policy and the journal see it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FetchCall {
    pub purpose: String,
    pub method: String,
    pub url: String,
}

/// What the policy decided for one [`FetchCall`]. The spike has no gateway, so
/// an allowed call is answered with the response the policy supplies and
/// nothing leaves the host; a blocked one reaches the module as its error.
#[derive(Debug, Clone)]
pub enum Verdict {
    Allow(Response),
    Block(String),
}

/// The one way out of a component: every `net.fetch` is decided here before
/// anything is sent.
pub trait NetPolicy: Send + Sync {
    fn decide(&self, call: &FetchCall) -> Verdict;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Allowed,
    Blocked(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FetchRecord {
    pub call: FetchCall,
    pub outcome: Outcome,
}
