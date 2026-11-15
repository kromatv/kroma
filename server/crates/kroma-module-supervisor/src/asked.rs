//! What a module asked the host for besides a connection, for whoever watches.

use std::sync::Arc;

/// One thing a module asked the host for: to start a program, or to reach a
/// file through the host's own file calls. A connection is not one of these:
/// it goes to the [`kroma_module_host::NetworkPolicy`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Asked {
    /// To start `name`. `granted` is false for a program its `permissions.run`
    /// does not name, and for any program asked for by a third-party module.
    Program { name: String, granted: bool },
    /// To read `path`, or to write it when `writing`. `granted` is false for a
    /// path outside every folder the module holds.
    File {
        path: String,
        writing: bool,
        granted: bool,
    },
}

/// Hears every [`Asked`], as `(module_id, asked)`.
pub type AskedSink = Arc<dyn Fn(&str, Asked) + Send + Sync>;

#[derive(Clone, Default)]
pub(crate) struct Watch {
    module: String,
    sink: Option<AskedSink>,
}

impl Watch {
    pub(crate) fn over(module: &str, sink: Option<AskedSink>) -> Self {
        Self {
            module: module.to_string(),
            sink,
        }
    }

    pub(crate) fn program(&self, name: &str, granted: bool) {
        self.saw(Asked::Program {
            name: name.to_string(),
            granted,
        });
    }

    pub(crate) fn file(&self, path: &str, writing: bool, granted: bool) {
        self.saw(Asked::File {
            path: path.to_string(),
            writing,
            granted,
        });
    }

    fn saw(&self, asked: Asked) {
        if let Some(sink) = &self.sink {
            sink(&self.module, asked);
        }
    }
}
