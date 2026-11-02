use crate::bindings::kroma::module::net::FetchRequest;
use crate::{Request, Response};

/// One `net.fetch` a module made, as the policy and the journal see it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FetchCall {
    pub purpose: String,
    pub method: String,
    pub url: String,
}

/// An allowed call is answered with the response the policy supplies; a blocked
/// one reaches the module as its error.
#[derive(Debug, Clone)]
pub enum Verdict {
    Allow(Response),
    Block(String),
}

/// The one way out of a component: everything it asks of the outside is decided
/// and carried here, on behalf of the module this was built for.
pub trait NetPolicy: Send + Sync {
    /// Rule on one `net.fetch` and, when it is allowed, make it.
    fn fetch(&self, request: &FetchRequest) -> Verdict;

    /// Rule on one `net.download` and, when it is allowed, write the body to
    /// `destination` on the module's behalf.
    fn download(&self, _request: &FetchRequest, _destination: &str) -> Verdict {
        Verdict::Block("this component may not download to a file".to_string())
    }

    /// Answer one call to the host API. A module's token is not its own to choose,
    /// so the policy adds it.
    fn host_api(&self, _request: &Request) -> Result<Response, String> {
        Err("this component has no host API".to_string())
    }
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
