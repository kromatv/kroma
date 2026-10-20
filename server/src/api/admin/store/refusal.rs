use kroma_module_manifest::EngineRefusal;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Refusal {
    #[serde(rename_all = "camelCase")]
    Schema {
        built: u64,
        speaks: u64,
    },
    UnknownEngine {
        engine: String,
    },
    #[serde(rename_all = "camelCase")]
    Engine {
        engine: String,
        range: String,
        server_version: String,
    },
    Platform {
        target: String,
    },
}

impl Refusal {
    pub fn engine(refusal: EngineRefusal, server_version: &str) -> Self {
        match refusal {
            EngineRefusal::Unknown { engine } => Self::UnknownEngine { engine },
            EngineRefusal::Unsatisfied { engine, range } => Self::Engine {
                engine,
                range,
                server_version: server_version.to_owned(),
            },
        }
    }

    pub fn reason(&self) -> String {
        match self {
            Self::Schema { built, speaks } => format!(
                "built for manifest schema v{built} (this server speaks v{speaks}); it needs rebuilding"
            ),
            Self::UnknownEngine { engine } => {
                EngineRefusal::Unknown { engine: engine.clone() }.to_string()
            }
            Self::Engine { engine, range, server_version } => {
                format!("requires {engine} {range} (this server is {server_version})")
            }
            Self::Platform { target } => format!("no build for this server's platform ({target})"),
        }
    }
}
