//! `/downloads/bandwidth` what the engine moved, and what the tunnel carried.

use axum::extract::{Query as AxQuery, State};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use kroma_module_sdk::host::{blocking, AuthUser, HostStorage};

use super::{dm, require_downloads};
use crate::bandwidth::Range;

#[derive(Debug, Default, Deserialize)]
struct RangeParams {
    #[serde(default)]
    range: Option<String>,
}

impl RangeParams {
    fn range(&self) -> Range {
        Range::parse(self.range.as_deref().unwrap_or_default())
    }
}

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/downloads/bandwidth", get(read::<S>))
}

async fn read<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxQuery(params): AxQuery<RangeParams>,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    let view = blocking(move || dm(&state).bandwidth(&state, params.range())).await?;
    Ok(Json(view).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_named_window_is_read_and_anything_else_falls_back_to_the_day() {
        let named = RangeParams {
            range: Some("30d".into()),
        };
        let absurd = RangeParams {
            range: Some("9".repeat(4096)),
        };

        assert_eq!(named.range(), Range::Month);
        assert_eq!(absurd.range(), Range::Day);
        assert_eq!(RangeParams::default().range(), Range::Day);
    }
}
