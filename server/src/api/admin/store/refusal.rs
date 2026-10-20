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

impl From<EngineRefusal> for Refusal {
    fn from(refusal: EngineRefusal) -> Self {
        match refusal {
            EngineRefusal::Unknown { engine } => Self::UnknownEngine { engine },
            EngineRefusal::Unsatisfied {
                engine,
                range,
                server_version,
            } => Self::Engine {
                engine,
                range,
                server_version,
            },
        }
    }
}

impl Refusal {
    pub fn reason(&self) -> String {
        match self {
            Self::Schema { built, speaks } => format!(
                "built for manifest schema v{built} (this server speaks v{speaks}); it needs rebuilding"
            ),
            Self::UnknownEngine { engine } => EngineRefusal::Unknown {
                engine: engine.clone(),
            }
            .to_string(),
            Self::Engine {
                engine,
                range,
                server_version,
            } => EngineRefusal::Unsatisfied {
                engine: engine.clone(),
                range: range.clone(),
                server_version: server_version.clone(),
            }
            .to_string(),
            Self::Platform { target } => format!("no build for this server's platform ({target})"),
        }
    }
}
