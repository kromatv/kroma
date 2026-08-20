//! Use-cases / orchestration: the domain workflows that coordinate the infra
//! adapters and the database.

pub mod auth;
pub mod backup;
pub mod jobs;
pub mod llm;
pub mod loginguard;
pub mod markers;
pub mod pipeline;
pub mod scan;
pub mod embeddings;
pub mod enrich;
pub mod rematch;
pub mod search;
pub mod sections;
pub mod pairing;
pub mod playback;
pub mod cast;
pub mod requests;
pub mod request_ledger;
pub mod notify;
pub mod library_missing;
pub mod settings;
pub mod subtitles;
pub mod activity;
pub mod demo;
