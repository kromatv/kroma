use anyhow::Result;
use kroma_module_sdk::http::Fetch;

const ACCOUNT_PURPOSE: &str = "plex-account";
const SERVER_PURPOSE: &str = "plex-server";

/// Which of the two `net.connect` entries of `module.json` a call leaves by.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Door {
    Account,
    Server,
}

/// One call to plex.tv or to a server. The headers carry the token, so this
/// has no `Debug`.
pub(crate) struct Call {
    pub door: Door,
    pub url: String,
    pub query: Vec<(&'static str, String)>,
    pub headers: Vec<(&'static str, String)>,
    pub max_bytes: u64,
    pub max_seconds: u32,
}

pub(crate) struct Answer {
    pub status: u16,
    pub body: Vec<u8>,
}

/// The network as the importer uses it. `post` exists for one call, the PIN
/// that starts a sign-in. An `Err` means nothing answered.
pub(crate) trait Web: Send + Sync {
    fn get(&self, call: &Call) -> Result<Answer>;
    fn post(&self, call: &Call, form: &[(&str, &str)]) -> Result<Answer>;
}

pub(crate) struct Live;

fn prepared(call: &Call) -> Fetch {
    let purpose = match call.door {
        Door::Account => ACCOUNT_PURPOSE,
        Door::Server => SERVER_PURPOSE,
    };
    let mut fetch = Fetch::new()
        .purpose(purpose)
        .no_redirects()
        .max_time(call.max_seconds)
        .max_bytes(call.max_bytes);
    if call.door == Door::Account {
        fetch = fetch.https_only();
    }
    for (name, value) in &call.headers {
        fetch = fetch.header(name, value.clone());
    }
    for (name, value) in &call.query {
        fetch = fetch.query(name, value.clone());
    }
    fetch
}

impl Web for Live {
    fn get(&self, call: &Call) -> Result<Answer> {
        let response = prepared(call).get(&call.url)?;
        Ok(Answer {
            status: response.status,
            body: response.body,
        })
    }

    fn post(&self, call: &Call, form: &[(&str, &str)]) -> Result<Answer> {
        let response = prepared(call).post_form(&call.url, form)?;
        Ok(Answer {
            status: response.status,
            body: response.body,
        })
    }
}
