//! Connectors that expose KROMA's data to a model as callable tools, on the
//! vendor-neutral [`ToolBox`](crate::infra::llm::ToolBox) foundation.

mod suggest;
mod tools;

pub use suggest::suggest_for;
pub use tools::CatalogTools;
