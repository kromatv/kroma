//! Connectors that expose KROMA's data to a model as callable tools, on the
//! vendor-neutral [`ToolBox`](crate::infra::llm::ToolBox) foundation.

mod budget;
mod suggest;
mod tools;

pub use budget::{localized_reply_budget, reply_budget};
pub use suggest::{covers, regenerate, suggest_for};
pub use tools::CatalogTools;
