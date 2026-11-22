use serde::Deserialize;

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub(crate) struct ConnectAsk {
    pub pending: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SurveyAsk {
    pub sign_in: String,
    pub server: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TitlesAsk {
    pub sign_in: String,
    pub server: String,
    pub library: String,
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub limit: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StatesAsk {
    pub sign_in: String,
    pub server: String,
    pub user: String,
    pub library: String,
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub changed_since: Option<i64>,
    #[serde(default)]
    pub limit: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlaysAsk {
    pub sign_in: String,
    pub server: String,
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub changed_since: Option<i64>,
    #[serde(default)]
    pub limit: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForgetAsk {
    pub sign_in: String,
}

/// It carries the PIN the owner typed, so it has no `Debug`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UnlockAsk {
    pub sign_in: String,
    pub server: String,
    pub user: String,
    pub pin: String,
}
