//! The options every transport takes, defined once.
//!
//! [`crate::Fetch`] and [`crate::Loopback`] accumulate headers, query pairs and
//! a time budget identically -- they differ in what they do with them, not in
//! how they are collected. Each expands this over its own fields, so the two
//! builders cannot drift and neither carries a copy of the other.

macro_rules! request_builder {
    ($transport:ty, query = $query_doc:expr) => {
        impl $transport {
            pub fn new() -> Self {
                Self::default()
            }

            pub fn header(mut self, name: &str, value: impl Into<String>) -> Self {
                self.headers.push((name.to_string(), value.into()));
                self
            }

            #[doc = $query_doc]
            pub fn query(mut self, name: &str, value: impl Into<String>) -> Self {
                self.query.push((name.to_string(), value.into()));
                self
            }

            /// Budget for the whole transfer (default 30s).
            pub fn max_time(mut self, secs: u32) -> Self {
                self.max_time_secs = secs;
                self
            }

            /// Sends `user` and `password` as HTTP Basic credentials.
            pub fn basic_auth(self, user: &str, password: &str) -> Self {
                let credentials = crate::basic::encode(format!("{user}:{password}").as_bytes());
                self.header("authorization", format!("Basic {credentials}"))
            }
        }
    };
}

pub(crate) use request_builder;
